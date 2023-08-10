const express = require("express");
const app = express();
const bodyParser = require("body-parser");
//const nexmo = require("nexmo-client");
const { Vonage } = require("@vonage/server-sdk");
const { Auth } = require("@vonage/auth");
const { Messages, SMS } = require("@vonage/messages");
const { Client } = require("@vonage/server-client");

require("dotenv").config();
const { generateToken } = require("./utils");

let baseUrl = "https://api.nexmo.com/v0.3/conversations";

/*
 * Store the conversation ID and member ID
 * {
 *   conversationId: id,
 *   conversationName: name
 *   mobileMemberId: id,
 *   mobileNumber: number,
 *   agentName: name,
 *   agentMemberId: id
 *
 * }
 */

let conversations = [];

const methods = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DELETE",
};

const vonageClient = new Client(
  new Auth({
    apiKey: process.env.VONAGE_API_KEY,
    apiSecret: process.env.VONAGE_API_SECRET,
    applicationId: process.env.VONAGE_APPLICATION_ID,
    privateKey: process.env.VONAGE_PRIVATE_KEY,
  })
);

const vonage = new Vonage(
  new Auth({
    applicationId: process.env.VONAGE_APPLICATION_ID,
    privateKey: process.env.VONAGE_PRIVATE_KEY,
  })
);

const mobileUser = process.env.MOBILE_USER;
const mobileNumber = process.env.DESTINATION_PHONE_NUMBER;
const agentName = process.env.WEBRTC_USER;
const conversationName = process.env.CONVERSATION_NAME;

let conversationId;
let memberId;
let mobileJWT;
let adminJWT;
//Generate the users' JWT tokens
mobileJWT = generateToken(process.env.MOBILE_USER_NAME);
adminJWT = generateToken(process.env.ADMIN_USER);

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
  if (to === process.env.VONAGE_NUMBER) {
    ncco = [
      {
        action: "talk",
        text: "Please wait while we connect you.",
      },
      {
        action: "connect",
        from: req.query.from,
        endpoint: [
          {
            type: "app",
            user: agentName,
          },
        ],
      },
    ];
  } else {
    const dest = JSON.parse(req.query.custom_data).dial;

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
            number: dest,
          },
        ],
      },
    ];
  }

  res.json(ncco);
});

app.post("/webhooks/event", (req, res) => {
  console.log("EVENT:");
  console.log(req.body);

  //Handle outbound SMS
  if (
    req.body.type === "text" &&
    req.body._embedded.from_user.name !== process.env.MOBILE_USER_NAME
  ) {
    const msg = req.body.body.text;
    console.log("Got a text message");

    conversationId = req.body.conversation_id;
    baseUrl = `${baseUrl}/${conversationId}`;

    console.log(msg);
    if (!msg) {
      console.log("No message to send");
      return;
    }
    vonage.messages.send({
      to: mobileNumber,
      from: process.env.VONAGE_NUMBER,
      text: msg,
      channel: "sms",
      messageType: "text",
    });
  }
  res.status(200).end();
});

app.get("/services/getConversationName", (req, res) => {
  console.log(`Returning conversation name: ${conversationName}`);

  res.json({ name: conversationName });
});

app.get("/services/getConversations", (req, res) => {
  res.json({ conversations: conversations });
});

app.get("/services/deleteConversations", (req, res) => {
  deleteConversations();
  res.status(200).end();
});

app.post("/webhooks/inbound", async (req, res) => {
  console.log(req.body);

  const mobileNumber = req.body.from;
  let { mobileMemberId, conversationId, agentMemberId } =
    findConversationForPhoneNumber(mobileNumber);

  let memberId = mobileMemberId;

  if (!memberId || !conversationId) {
    console.log("Received inbound message but no member ID");
    try {
      ({ memberId, conversationId, agentMemberId } = await joinConversation(
        conversationId,
        mobileUser,
        mobileNumber,
        agentName
      ));
    } catch (e) {
      console.log(e);
    }
  }

  storeConversation(
    conversationId,
    conversationName,
    mobileNumber,
    memberId,
    agentName,
    agentMemberId
  );

  const url = `${baseUrl}/${conversationId}/events`;

  const params = {
    type: "text",
    from: memberId,
    body: { text: req.body.text },
  };
  res.status(200).end();
  send(mobileJWT, methods.POST, url, params);
});

app.post("/webhooks/status", (req, res) => {
  console.log("STATUS:");
  console.log(req.body);
  res.status(200).end();
});

app.get("/webhooks/status", (req, res) => {
  console.log("STATUS:");
  console.log(req.query);
  res.status(200).end();
});

async function joinConversation(conversationId, userId, userNumber, agent) {
  return new Promise(async (resolve, reject) => {
    console.log("Trying to join conversation");
    if (!conversationId) {
      console.log("No conversation ID.");
      conversationId = await findOrCreateConversation(conversationName);
    }

    if (!conversationId) {
      console.log("No conversation ID.");
      return;
    }

    console.log(`Found Conversation ID: ${conversationId}`);

    let memberId = await findMemberId(conversationId);

    if (memberId) {
      resolve({ memberId, conversationId });
    } else {
      console.log(`No member ID found in ${conversationId}. Creating one.`);
    }

    const url = `${baseUrl}/${conversationId}/members`;
    const params = {
      state: "joined",
      user: { id: userId },
      channel: {
        type: "app",
        from: { type: "app", user: mobileUser },
        to: { type: "app", user: agent },
      },
    };
    let body = null;
    let agentMemberId;

    try {
      body = await send(mobileJWT, methods.POST, url, params);
      memberId = body.id;
      //conversationId = body.conversation_id;
      try {
        ({ agentMemberId } = await addAgent(conversationId, agentName));
      } catch (e) {
        console.log(
          "Caught Error trying to add Agent after joining mobile user to conversation",
          e
        );
      }

      // if (!agentMemberId) {
      //   throw new Error("Couldn't add agent");
      // }

      console.log(
        `Joined conversation ${conversationId} as member ${memberId} and added ${agentMemberId} as agent.}`
      );

      resolve({ memberId, conversationId, agentMemberId });
    } catch (e) {
      console.log(e);
      throw e;
    }
  });
}

async function addAgent(conversationId, agentName) {
  console.log(`Adding agent to conversation: ${conversationId}`);
  return new Promise(async (resolve, reject) => {
    const url = `${baseUrl}/${conversationId}/members`;
    const params = {
      state: "joined",
      user: { name: agentName },
      channel: {
        type: "app",
        from: { type: "app", user: agentName },
        to: { type: "app", user: agentName },
      },
    };
    let body = null;
    let agentMemberId;
    try {
      body = await send(adminJWT, methods.POST, url, params);

      if (body.status === 200 || body.status === 201) {
        agentMemberId = body.id;
        const conversationId = body.conversation_id;
        console.log(
          `Joined conversation ${conversationId} as member ${agentMemberId}`
        );
      } else {
        console.log("Couldn't add agent");
      }
      resolve({ agentMemberId, conversationId });
    } catch (e) {
      console.log(e);
      throw e;
    }
  });
}

async function findMemberId(conversationId) {
  return new Promise(async (resolve, reject) => {
    const url = `${baseUrl}/${conversationId}/members/me`;
    try {
      const body = await send(mobileJWT, methods.GET, url, null);
      console.log("Member", body);

      resolve(body.id);
    } catch (e) {
      throw e;
    }
  });
}

async function createConversation(name) {
  return new Promise(async (resolve, reject) => {
    const url = baseUrl;
    console.log("Creating conversation.");
    const params = {
      name: name,
    };

    let cId;
    try {
      const body = await send(mobileJWT, methods.POST, url, params);
      cId = body.id;
      if (!cId) {
        throw new Error(`Couldn't create conversation. ${body}`);
      }
      console.log(`Created conversation: ${cId}`);
      storeConversation(cId, name);
      resolve(cId);
    } catch (e) {
      throw e;
    }
  });
}

function findOrCreateConversation(name) {
  return new Promise(async (resolve, reject) => {
    const url = baseUrl;
    let cId;

    try {
      const ret = await send(adminJWT, methods.GET, url, null);
      cId = getConversationIdFromList(ret, name);

      if (!cId) {
        console.log("No conversations found. Creating one.");
        cId = await createConversation(name);
      }

      resolve(cId);
    } catch (e) {
      console.log(e);
      throw e;
    }
  });
}
async function deleteConversations() {
  return new Promise(async (resolve, reject) => {
    const url = baseUrl;

    try {
      const conversations = await fetchConversations();
      if (conversations.length > 0) {
        for (const c of conversations) {
          const url = `${baseUrl}/${c.id}`;
          const ret = await send(adminJWT, methods.DELETE, url, null);
          console.log(ret);
        }
      }
      resolve();
    } catch (e) {
      throw e;
    }
  });
}
async function fetchConversations() {
  return new Promise(async (resolve, reject) => {
    const url = baseUrl;
    try {
      const ret = await send(adminJWT, methods.GET, url, null);
      resolve(ret._embedded.conversations);
    } catch (e) {
      throw e;
    }
  });
}

function getConversationIdFromList(list, name) {
  const conversations = list._embedded.conversations;
  let cId;
  if (conversations.length > 0) {
    const conv = conversations.find((c) => c.name === name);
    if (conv) {
      cId = conv.id;
      console.log(`Found conversation ${cId}`);
    }
  }
  return cId;
}

function send(jwt, method, url, params) {
  return new Promise(async (resolve, reject) => {
    let options;

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    };

    switch (method) {
      case methods.POST:
        options = {
          method: method,
          headers: headers,
          body: JSON.stringify(params),
        };
        break;
      case methods.GET:
      case methods.DELETE:
        options = {
          method: method,
          headers: headers,
        };
    }

    let body = null;
    try {
      console.log(`Calling ${url} with options:`, options);
      res = await fetch(url, options);
      body = await res.json();
      console.log(res.status);
      console.log("BODY", body);
      body.http_status = res.status;
      resolve(body);
    } catch (e) {
      console.log(`Error sending to ${url}`);
      throw e;
    }
  });
}

/*
 * Find conversation for mobile number
 */
function findConversationForPhoneNumber(mobileNumber) {
  let conversation = conversations.find((c) => c.mobileNumber === mobileNumber);
  if (!conversation) {
    console.log("No conversation found for mobile number");
    return { conversationId: null, memberId: null };
  } else {
    console.log(
      `Found conversation for mobile number: ${conversation.conversationId}`
    );
    return {
      conversationId: conversation.conversationId,
      mobileMemberId: conversation.mobileMemberId,
      agentMemberId: conversation.agentMemberId,
    };
  }
}

function findConversationByName(name) {
  let conversation = conversations.find((c) => c.conversationName === name);
  if (!conversation) {
    console.log("No conversation found for name");
    return { conversationId: null, memberId: null };
  } else {
    return {
      conversationId: conversation.conversationId,
      mobileMemberId: conversation.mobileMemberId,
      agentMemberId: conversation.agentMemberId,
    };
  }
}

/*
 * Store the conversation ID and member ID
 * {
 *   conversationId: id,
 *   conversationName: name
 *   mobileMemberId: id,
 *   mobileNumber: number,
 *   agentName: name,
 *   agentMemberId: id
 *
 * }
 */
function storeConversation(
  conversationId,
  conversationName,
  mobileNumber = null,
  mobileMemberId = null,
  agentName = null,
  agentMemberId = null
) {
  const i = conversations.findIndex((c) => c.conversationId === conversationId);

  if (i === -1) {
    conversations.push({
      conversationId: conversationId,
      conversationName: conversationName,
      mobileMemberId: mobileMemberId,
      mobileNumber: mobileNumber,
      agentName: agentName,
      agentMemberId: agentMemberId,
    });
  } else {
    conversations[i].conversationName = conversationName;
    conversations[i].mobileMemberId = mobileMemberId;
    conversations[i].mobileNumber = mobileNumber;
    conversations[i].agentName = agentName;
    conversations[i].agentMemberId = agentMemberId;
  }
}
