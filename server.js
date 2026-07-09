const port = Number(process.env.PORT || process.env.nodeport) || 3000;
const app = require("./app");

app.listen(port, () => {
  console.log(`Board Night server listening at http://localhost:${port}`);
});
