exports.handler = async function () {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ ok: true, fn: "netlify/ping" }),
  };
};
