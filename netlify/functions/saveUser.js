const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join("/tmp", "users.json");

exports.handler = async (event) => {

  const { email, user } = JSON.parse(event.body);

  let data = {};

  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE));
  }

  data[email] = user;

  fs.writeFileSync(DATA_FILE, JSON.stringify(data));

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  };
};