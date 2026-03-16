exports.handler = async function () {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/plain"
    },
    body: "TTS function working"
  };
};