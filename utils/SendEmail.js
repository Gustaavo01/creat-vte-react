const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendEmail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: `"Loja Pijamas" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(" E-mail enviado com sucesso!");
  } catch (error) {
    console.error(" Erro ao enviar e-mail:", error);
  }
}

module.exports = sendEmail;
