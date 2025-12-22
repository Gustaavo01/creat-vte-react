const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const User = require("../models/User");


const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL;
const SECURE_COOKIE = process.env.NODE_ENV === "production";
const COOKIE_SAMESITE = process.env.NODE_ENV === "production" ? "none" : "lax";


const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const loginAttempts = new Map();
const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
const WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS || 15 * 60 * 1000);
const LOCK_MS = Number(process.env.LOGIN_LOCK_MS || 15 * 60 * 1000);

const MAX_NAME_LEN = Number(process.env.NAME_MAX_LEN || 60);
const MAX_EMAIL_LEN = Number(process.env.EMAIL_MAX_LEN || 254);
const MIN_PASSWORD_LEN = Number(process.env.PASSWORD_MIN_LEN || 8);
const MAX_PASSWORD_LEN = Number(process.env.PASSWORD_MAX_LEN || 128);
const EMAIL_REQ_MAX = Number(process.env.EMAIL_REQ_MAX || 5);
const EMAIL_REQ_WINDOW_MS = Number(process.env.EMAIL_REQ_WINDOW_MS || 15 * 60 * 1000);
const emailRequests = new Map();

function normalizeStr(v) {
  return String(v || "").trim();
}

function limitLen(v, max) {
  return v.length > max ? v.slice(0, max) : v;
}

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= MAX_EMAIL_LEN;
}

function isStrongPassword(p) {
  return (
    typeof p === "string" &&
    p.length >= MIN_PASSWORD_LEN &&
    p.length <= MAX_PASSWORD_LEN &&
    /[a-z]/.test(p) &&
    /[A-Z]/.test(p) &&
    /\d/.test(p) &&
    /[^A-Za-z0-9]/.test(p)
  );
}

function getAttemptKey(req, email) {
  const ip = (req.ip || "").toString();
  const em = (email || "").toString().toLowerCase().trim();
  return `${ip}|${em}`;
}

function checkLoginRateLimit(req, res, next) {
  try {
    const email = (req.body && req.body.email) || "";
    const key = getAttemptKey(req, email);
    const now = Date.now();
    const data = loginAttempts.get(key);
    if (data && data.lockUntil && now < data.lockUntil) {
      const retryIn = Math.ceil((data.lockUntil - now) / 1000);
      return res.status(429).json({ message: `Muitas tentativas. Tente novamente em ${retryIn}s.` });
    }
    if (data && data.firstAt && now - data.firstAt > WINDOW_MS) {
      loginAttempts.delete(key);
    }
    return next();
  } catch (e) {
    return next();
  }
}

function registerFailedAttempt(req, email) {
  const key = getAttemptKey(req, email);
  const now = Date.now();
  const data = loginAttempts.get(key);
  if (!data) {
    loginAttempts.set(key, { count: 1, firstAt: now, lockUntil: 0 });
    return;
  }
  const withinWindow = now - (data.firstAt || 0) <= WINDOW_MS;
  const count = withinWindow ? (data.count || 0) + 1 : 1;
  const firstAt = withinWindow ? data.firstAt : now;
  let lockUntil = 0;
  if (count >= MAX_ATTEMPTS) {
    lockUntil = now + LOCK_MS;
  }
  loginAttempts.set(key, { count, firstAt, lockUntil });
}

function clearAttempts(req, email) {
  const key = getAttemptKey(req, email);
  loginAttempts.delete(key);
}

function checkEmailLimit(req, res, next) {
  try {
    const email = normalizeStr((req.body && req.body.email) || "");
    if (!email) return next();
    const key = `${req.ip || ""}|${email.toLowerCase()}`;
    const now = Date.now();
    const d = emailRequests.get(key);
    if (d && now - d.firstAt <= EMAIL_REQ_WINDOW_MS) {
      if ((d.count || 0) >= EMAIL_REQ_MAX) {
        return res.status(429).json({ message: "Muitas solicitações para este e-mail. Tente mais tarde." });
      }
      emailRequests.set(key, { count: (d.count || 0) + 1, firstAt: d.firstAt });
    } else {
      emailRequests.set(key, { count: 1, firstAt: now });
    }
    return next();
  } catch (e) {
    return next();
  }
}


router.post("/cadastro", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    console.log(" Requisição /cadastro recebida:", { name, email });

    if (!name || !email || !password)
      return res.status(400).json({ message: "Preencha todos os campos." });

    const normalizedEmail = normalizeStr(email).toLowerCase();
    const normalizedName = normalizeStr(name);
    if (!isValidEmail(normalizedEmail)) return res.status(400).json({ message: "E-mail inválido." });
    if (normalizedName.length < 2 || normalizedName.length > MAX_NAME_LEN) {
      return res.status(400).json({ message: `Nome deve ter entre 2 e ${MAX_NAME_LEN} caracteres.` });
    }
    if (!isStrongPassword(String(password))) {
      return res.status(400).json({ message: "Senha deve ter pelo menos 8 caracteres, incluindo maiúscula, minúscula, número e símbolo." });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser && !existingUser.isVerified) {
      console.log(" Usuário existe, mas ainda não verificou. Reenviando e-mail...");
      const token = jwt.sign({ id: existingUser._id }, process.env.JWT_SECRET, {
        expiresIn: "1d",
      });

      const verifyLink = `${FRONTEND_URL}/verificar/${token}`;
      await transporter.sendMail({
        from: `"Loja Pijamas" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Reenvio - Ative sua conta na Loja Pijamas",
        html: `<h2>Olá novamente, ${existingUser.name}!</h2>
               <p>Ative sua conta clicando abaixo:</p>
               <a href="${verifyLink}" target="_blank">Ativar conta</a>`,
      });

      return res.json({
        message: "Reenviamos o link de ativação para seu e-mail.",
      });
    }

    if (existingUser && existingUser.isVerified)
      return res.status(400).json({ message: "Usuário já existe e está ativo." });

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const newUser = new User({
      name: normalizedName,
      email: normalizedEmail,
      password: hashedPassword,
      role: "user",
      isVerified: false,
    });

    await newUser.save();
    console.log(" Novo usuário criado:", newUser.email);

    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });
    const verifyLink = `${FRONTEND_URL}/verificar/${token}`;

    await transporter.sendMail({
      from: `"Loja Pijamas" <${process.env.EMAIL_USER}>`,
      to: normalizedEmail,
      subject: "Ative sua conta na Loja Pijamas",
      html: `<h2>Olá, ${name}!</h2>
             <p>Ative sua conta clicando no link abaixo:</p>
             <a href="${verifyLink}" target="_blank">Ativar conta</a>`,
    });

    res.status(201).json({
      message: "Usuário cadastrado! Verifique seu e-mail para ativar a conta.",
    });
  } catch (err) {
    console.error(" Erro no cadastro:", err);
    res.status(500).json({ message: "Erro no servidor." });
  }
});


router.get("/verificar/:token", async (req, res) => {
  try {
    console.log(" Verificando token...");
    const { token } = req.params;
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    const user = await User.findById(decoded.id);

    if (!user) return res.status(400).json({ message: "Usuário não encontrado." });
    if (user.isVerified)
      return res.status(400).json({ message: "Conta já verificada." });

    user.isVerified = true;
    await user.save();
    console.log(" Conta verificada:", user.email);

    res.json({ message: "Conta ativada com sucesso!" });
  } catch (err) {
    console.error(" Erro na verificação:", err);
    const msg = err && err.name === "TokenExpiredError" ? "Link expirado." : "Link inválido.";
    res.status(400).json({ message: msg });
  }
});


router.post("/login", checkLoginRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email).trim().toLowerCase();
    console.log(" Tentando login:", normalizedEmail);

    if (
      normalizedEmail === String(process.env.ADMIN_EMAIL || "").trim().toLowerCase() &&
      password === process.env.ADMIN_PASSWORD
    ) {
      console.log("Login de administrador detectado.");
      const token = jwt.sign(
        { id: "admin-env", role: "admin", name: "Administrador", email: process.env.ADMIN_EMAIL },
        process.env.JWT_SECRET,
        { expiresIn: "2h" }
      );

      res.cookie("token", token, {
        httpOnly: true,
        secure: SECURE_COOKIE,
        sameSite: COOKIE_SAMESITE,
        maxAge: 2 * 60 * 60 * 1000,
      });

      clearAttempts(req, normalizedEmail);
      return res.json({
        user: {
          id: "admin-env",
          name: "Administrador",
          email: process.env.ADMIN_EMAIL,
          role: "admin",
        },
        expiresAt: Date.now() + 2 * 60 * 60 * 1000,
      });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      console.log(" E-mail não encontrado:", normalizedEmail);
      registerFailedAttempt(req, normalizedEmail);
      return res.status(400).json({ message: "Credenciais inválidas." });
    }

    if (!user.isVerified) {
      console.log(" Conta não verificada:", email);
      registerFailedAttempt(req, normalizedEmail);
      return res
        .status(403)
        .json({ message: "Verifique seu e-mail antes de entrar." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log(" Senha incorreta para:", email);
      registerFailedAttempt(req, normalizedEmail);
      return res.status(400).json({ message: "Credenciais inválidas." });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: SECURE_COOKIE,
      sameSite: COOKIE_SAMESITE,
      maxAge: 2 * 60 * 60 * 1000,
    });

    console.log(" Login bem-sucedido:", email);

    clearAttempts(req, normalizedEmail);
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    });
  } catch (err) {
    console.error(" Erro no login:", err);
    res.status(500).json({ message: "Erro no servidor." });
  }
});


router.post("/logout", (req, res) => {
  console.log(" Logout realizado.");
  res.clearCookie("token");
  res.json({ message: "Logout realizado com sucesso." });
});


router.post("/recuperar-senha", checkEmailLimit, async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = normalizeStr(email).toLowerCase();
    console.log(" Pedido de recuperação:", normalizedEmail);

    if (!normalizedEmail) return res.status(400).json({ message: "Informe o e-mail." });
    if (!isValidEmail(normalizedEmail)) return res.status(400).json({ message: "E-mail inválido." });
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(400).json({ message: "E-mail não encontrado." });

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpire = Date.now() + 15 * 60 * 1000;

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = resetTokenExpire;
    await user.save();

    const resetLink = `${FRONTEND_URL}/trocar-senha/${resetToken}`;
    console.log(" Link de reset gerado:", resetLink);

    await transporter.sendMail({
      from: `"Loja Pijamas" <${process.env.EMAIL_USER}>`,
      to: normalizedEmail,
      subject: "Recuperação de senha",
      html: `<h2>Olá, ${user.name}</h2>
             <p>Clique no link abaixo para redefinir sua senha:</p>
             <a href="${resetLink}" target="_blank">Trocar senha</a>`,
    });


 
    res.json({ message: "E-mail de recuperação enviado com sucesso." });
  } catch (err) {
    console.error(" Erro em /recuperar-senha:", err);
    res.status(500).json({ message: "Erro ao enviar e-mail." });
  }
});

router.post("/reenviar-verificacao", checkEmailLimit, async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = normalizeStr(email).toLowerCase();
    console.log(" Reenvio de verificação:", normalizedEmail);
    if (!normalizedEmail) return res.status(400).json({ message: "Informe o e-mail." });
    if (!isValidEmail(normalizedEmail)) return res.status(400).json({ message: "E-mail inválido." });
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(400).json({ message: "Usuário não encontrado." });
    if (user.isVerified) return res.status(400).json({ message: "Conta já verificada." });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
    const verifyLink = `${FRONTEND_URL}/verificar/${token}`;
    await transporter.sendMail({
      from: `"Loja Pijamas" <${process.env.EMAIL_USER}>`,
      to: normalizedEmail,
      subject: "Ative sua conta na Loja Pijamas",
      html: `<h2>Olá, ${user.name}</h2>
             <p>Ative sua conta clicando no link abaixo:</p>
             <a href="${verifyLink}" target="_blank">Ativar conta</a>`,
    });
    res.json({ message: "Link de verificação reenviado com sucesso." });
  } catch (err) {
    console.error(" Erro em /reenviar-verificacao:", err);
    res.status(500).json({ message: "Erro ao reenviar verificação." });
  }
});

router.post("/trocar-senha/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { novaSenha } = req.body;
    console.log(" Tentando trocar senha com token:", token);

    if (!novaSenha || !isStrongPassword(String(novaSenha))) {
      return res.status(400).json({ message: "Senha deve ter pelo menos 8 caracteres, incluindo maiúscula, minúscula, número e símbolo." });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ message: "Token inválido ou expirado." });

    const hashedPassword = await bcrypt.hash(novaSenha, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    console.log(" Senha trocada com sucesso:", user.email);


    await transporter.sendMail({
      from: `"Loja Pijamas" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Senha alterada com sucesso",
      html: `<h2>Olá, ${user.name}</h2>
             <p>Sua senha foi alterada com sucesso.</p>
             <p>Se você não fez essa alteração, entre em contato com o suporte imediatamente.</p>`,
    });

    res.json({ message: "Senha alterada com sucesso!" });
  } catch (err) {
    console.error(" Erro em /trocar-senha:", err);
    res.status(500).json({ message: "Erro ao redefinir senha." });
  }
});


router.get("/me", (req, res) => {
  try {
    const authHeader = req.get("Authorization") || "";
    const parts = authHeader.split(" ");
    const headerToken = parts[0]?.toLowerCase() === "bearer" ? (parts[1] || "").trim() : "";
    const cookieToken = req.cookies && req.cookies.token ? String(req.cookies.token).trim() : "";
    const token = headerToken || cookieToken;
    if (!token) {
      console.log(" Nenhum token encontrado.");
      return res.json({ user: null });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    console.log(" Usuário logado:", decoded);
    res.json({ user: decoded });
  } catch (err) {
    console.error(" Erro ao verificar /me:", err);
    res.json({ user: null });
  }
});

module.exports = router;
