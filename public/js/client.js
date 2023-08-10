document.addEventListener("DOMContentLoaded", async () => {
  // Fetch a JWT from the server to authenticate the user
  const response = await fetch("/auth/supportuser");
  const jwt = await response.json();
  let blink = false;
  const nameService = await fetch("/services/getConversationName").then((res) =>
    res.json()
  );
  const conversationName = nameService.name;
  console.log(conversationName);

  // Create a new NexmoClient instance and authenticate with the JWT
  let client = new NexmoClient();
  application = await client.createSession(jwt);
  notifications.innerHTML = `You are logged in as ${application.me.name}`;

  let conversation = null;
  let textConversation = null;

  /*
   * Process call events
   */
  application.on("member:call", (member, call) => {
    console.log("receiving call.");

    let terminateCall = () => {
      call.hangUp();
      toggleCallStatusButton("idle");
      btnHangup.removeEventListener("click", terminateCall);
    };

    let answerCall = () => {
      call.answer();
      btnAnswer.classList.remove("button-blink");
      toggleCallStatusButton("in_progress");
    };

    /*
     * If the call is inbound, flash the "Answer" button until it is answered
     */
    if (call.direction === "inbound") {
      toggleCallStatusButton("ringing");
    }

    btnAnswer.addEventListener("click", answerCall);
    btnHangup.addEventListener("click", terminateCall);

    /*
     * Retrieve the Conversation so that we can determine if a
     * Member has left and refresh the button state
     */
    conversation = call.conversation;
    conversation.on("member:left", (member, event) => {
      toggleCallStatusButton("idle");
    });
  });

  btnSend.addEventListener("click", () => {
    console.log(`Sending message: ${msg.value}`);
    sendMessage(msg.value);
  });

  /*
   * When we click the call button, trigger a call to the support number
   * and hide the Call Now button
   */
  btnCall.addEventListener("click", () => {
    application.callServer(application.me.name, "phone", {
      dial: "14083142771",
    });
    toggleCallStatusButton("in_progress");
  });

  async function sendMessage(msg) {
    try {
      if (textConversation === null) {
        console.log("Creating a new conversation");
        textConversation = await application.newConversationAndJoin({
          params: { name: conversationName },
        });
      }
      textConversation.sendText(msg);
    } catch (e) {
      console.error("Error creating a conversation and joining ", e);
    }
  }
});

function toggleCallStatusButton(state) {
  switch (state) {
    case "idle":
      btnCall.style.display = "inline-block";
      btnAnswer.style.display = "inline-block";
      btnHangup.style.display = "none";
      btnAnswer.classList.remove("button-blink");
      break;
    case "in_progress":
      btnCall.style.display = "none";
      btnHangup.style.display = "inline-block";
      btnAnswer.classList.remove("button-blink");
      break;
    case "ringing":
      btnAnswer.classList.add("button-blink");
      break;
  }
}
