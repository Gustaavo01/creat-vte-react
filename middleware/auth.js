const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  const authHeader = req.get("Authorization") || "";
  const parts = authHeader.split(" ");
  const headerToken = parts[0]?.toLowerCase() === "bearer" ? (parts[1] || "").trim() : "";
  const cookieToken = req.cookies && req.cookies.token ? String(req.cookies.token).trim() : "";
  const token = headerToken || cookieToken || "";

  if (!token) {
    res.set("WWW-Authenticate", 'Bearer realm="api", error="invalid_token", error_description="Token não fornecido"');
    return res.status(401).json({ message: "Acesso negado. Token não fornecido." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    req.user = decoded;
    return next();
  } catch (err) {
    const msg = err && err.name === "TokenExpiredError" ? "Token expirado." : "Token inválido.";
    res.set("WWW-Authenticate", `Bearer realm="api", error="invalid_token", error_description="${msg}"`);
    return res.status(401).json({ message: msg });
  }
};
