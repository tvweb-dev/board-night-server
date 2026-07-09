const port = Number(process.env.PORT) || 3000;
const app = require("./app");

app.listen(port, () => {
  console.log(`Board Night server listening at http://localhost:${port}`);
});
