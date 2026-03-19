const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join("/tmp", "users.json");

exports.handler = async (event) => {

  const { email } = JSON.parse(event.body);

  if (!fs.existsSync(DATA_FILE)) {
    return {
      statusCode: 200,
      body: JSON.stringify({ user: null })
    };
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE));

  return {
    statusCode: 200,
    body: JSON.stringify({
      user: data[email] || null
    })
  };
};