# Client SDK - WebRTC Calling
This is a use case that demonstrates how to use a button on a webpage to dial a Vonage number and have the call routed to a dedicated support number. It also handles inbound calls and routes them to a browser.

## Purchase a Vonage number

If you don't already have one, you can purchase a Vonage number using either the [Dashboard](https://dashboard.nexmo.com) or the following [vonage-cli](https://github.com/Vonage/vonage-cli) command:

```sh
vonage numbers:search US
vonage numbers:buy 15555555555 US
```

## Create an application

Run the following Nexmo CLI command in your application directory, replacing `abc123.ngrok.io` with your own public-facing server URL:

```sh
vonage apps:create "ClickToCall" --voice_answer_url=https://abc123.ngrok.io/webhooks/answer --voice_event_url=https://abc123.ngrok.io/webhooks/event
```

Make a note of the `APPLICATION_ID` returned by this command.

The `clicktocall.key` and `vonage_app.json` files are saved to your application directory.

## Link your Vonage Number

Link your Vonage number to your application:

```sh
vonage apps:link APPLICATION_ID --number=YOUR_VONAGE_NUMBER
```

## Create a User

Create a user that your site will use to place the call, with the following Vonage CLI command:

```sh
vonage apps:users:create "supportuser"
User ID: USER_ID
```

## Configure the application

Copy `example.env` to `.env` and then populate it as follows:

```
VONAGE_APPLICATION_ID= //Application ID, from above
VONAGE_PRIVATE_KEY=private.key   //The Private Key from above
PORT=5000
VONAGE_NUMBER= //The Vonage number you purchased
DESTINATION_PHONE_NUMBER=  //A phone number you want to call (e.g., your cell number)
WEBRTC_USER=supportuser  //the user you created above
```

Both phone numbers should include the country code, but omit any leading zeroes (e.g., 14085551212).

## Install dependencies

Run the following to install dependencies:

```sh
npm install
```

## Ensure that your webhooks are accessible

Your webhooks (in `server.js`) must be accessible over the public Internet for Vonage's APIs to be able to notify you about inbound calls and associated events. Consider using a tool like [ngrok](https://ngrok.com) for this.

## Start your server

```sh
npm start
```

## Run the application

Launch your application from your browser by entering `http://localhost:3000` in the address bar (changing the port number from `3000` to whatever you configured in `.env`).

Click the "Call Now!" button. The application should read a welcome message and then transfer the call to your target phone number (`DESTINATION_PHONE_NUMBER` in `.env`).


