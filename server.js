const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const nexmo = require("nexmo-client");
const { generateToken } = require("./utils");

require("dotenv").config();

app.set("view engine", "pug");

app.use(express.static("public"));
app.use("/modules", express.static("node_modules/nexmo-client/dist/"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const server = app.listen(process.env.PORT || 3000);

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/auth/:userid", (req, res) => {
  console.log(`Authenticating ${req.params.userid}`);
  const jwt = generateToken(req.params.userid);
  return res.json(jwt);
});

app.get("/webhooks/answer", (req, res) => {
  console.log("Answer:");
  console.log(req.query);
  let ncco;

  const to = req.query.to;

  /*
   * This is an inbound call which I will connect
   * to my app user via WebRTC
   */
  if (to === "18335808845") {
    ncco = [
      {
        action: "talk",
        text: "Please wait while we connect you .",
      },
      {
        action: "connect",
        from: req.query.from,
        endpoint: [
          {
            type: "app",
            user: "supportuser",
          },
        ],
      },
    ];
  } else {
    /*
     * This is an outbound call from the app user to a
     * destination phone number.
     */
    ncco = [
      {
        action: "talk",
        text: "Connecting you to the customer now.",
      },
      {
        action: "connect",
        from: process.env.VONAGE_NUMBER,
        endpoint: [
          {
            type: "phone",
            number: process.env.DESTINATION_PHONE_NUMBER,
          },
        ],
      },
    ];
  }
  res.json(ncco);
});

app.post("/webhooks/event", (req, res) => {
  //console.log("EVENT:");
  //console.log(req.body);
  res.status(200).end();
});
