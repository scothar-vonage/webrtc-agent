const { tokenGenerate } = require("@vonage/jwt");
require("dotenv").config();
var fs = require("fs");

const privateKey = fs.readFileSync(`./${process.env.VONAGE_PRIVATE_KEY}`);

const aclPaths = {
  paths: {
    "/*/users/**": {},
    "/*/conversations/**": {},
    "/*/sessions/**": {},
    "/*/devices/**": {},
    "/*/image/**": {},
    "/*/media/**": {},
    "/*/applications/**": {},
    "/*/push/**": {},
    "/*/knocking/**": {},
    "/*/legs/**": {},
  },
};

function generateToken(user) {
  return tokenGenerate(process.env.VONAGE_APPLICATION_ID, privateKey, {
    //expire in 24 hours
    exp: Math.round(new Date().getTime() / 1000) + 86400,
    sub: user,
    acl: aclPaths,
  });
}

module.exports = { generateToken };
