exports.handler = async (event) => {

  const { email } = JSON.parse(event.body);

  // 🔥 TEMP: manually allowed emails
  const allowedEmails = [
    "nekhbrazil@gmail.com"
  ];

  const normalized = email.toLowerCase();

return {
  statusCode: 200,
  body: JSON.stringify({
    allowed: allowedEmails.includes(normalized)
  })
};
};