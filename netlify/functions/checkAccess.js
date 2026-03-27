exports.handler = async (event) => {

  const { email } = JSON.parse(event.body);

  // 🔥 TEMP: manually allowed emails
  const allowedEmails = [
    "nekhbrazil@gmail.com",
    "teodor@skjaeveland.eu",
    "olegeorg.torvolt@gmail.com",
    "eocmodernrs@gmail.com",
    "georgboy94@gmail.com",
    "biagomes1217@gmail.com",
"andreasoliver95@hotmail.com"


  ];

  const normalized = email.toLowerCase();

return {
  statusCode: 200,
  body: JSON.stringify({
    allowed: allowedEmails.includes(normalized)
  })
};
};