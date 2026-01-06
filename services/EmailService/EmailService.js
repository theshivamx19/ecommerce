const nodemailer = require("nodemailer");
const emailConfig = require("../../config/emailConfig");

const emailService = async (to, subject, htmlContent) => {
    try {
        const transporter = nodemailer.createTransport(emailConfig);
        const mailOptions = {
            from: emailConfig.auth.user,
            to: to,
            subject: subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions)
        console.log('Email sent successfully: ' + info.messageId);
        return {
            success: true,
            messageId: info.messageId,
            response: info.response
        };
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
}
module.exports = emailService;