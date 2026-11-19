# Privacy policy — Goose On The Go

**Status: draft. Not yet published.** Six facts below are marked `[NEEDS ANSWER]` and
cannot be settled from the app's source code. This document must not be hosted, linked
from the app, or submitted to either store until every one of them is filled in. See
`docs/DATA-SAFETY.md` for the evidence behind everything that is filled in, and for the
list of what is not.

Last updated: [NEEDS ANSWER — date of publication]

---

## The short version

Goose On The Go is a remote control for a server you own. Almost everything the app does
happens between your phone and that server, and nothing about it passes through us.

We are not a cloud service holding your data. There is no account with us, no analytics,
no advertising, and no third party watching what you do in the app. If you never turn on
remote access, your phone and your Pond never talk to us at all.

One thing you can ask for does reach a company outside your home: a ride. When you ask
Goose for a ride fare, your phone reads where you are once and your Pond passes that pickup
point to Uber, so Uber can price the ride you asked for. That is described below too.

Your Pond itself reaches some services on the internet to do what you ask of it, such as the
weather for where you live or a web search. Those are your Pond's, not this app's, and your
Pond's own settings show and control them.

The rest of this document says exactly what happens when you do turn it on, because a
promise like the one above is only worth anything if the exceptions are stated plainly.

## What stays on your phone

Your phone keeps the credentials for your Pond in the device's own protected storage — the
Keychain on iOS, EncryptedSharedPreferences on Android. That means your session token, the
token used to renew it, your Pond's verified identity, and a random identifier generated on
your phone when you install the app.

That identifier is how your Pond recognises this phone when you pair with it again, instead
of gradually filling up with duplicate entries. It is generated on your device, it is not
derived from anything about your hardware, and it goes nowhere except to your own Pond.

If you choose to open My Pond with your phone's security, your phone also keeps its own key to
My Pond in that protected storage. Only your phone's own check can read it: Face ID or a
fingerprint on an iPhone, a fingerprint or the phone's PIN, pattern or password on Android. It is
never included in a backup or moved to another phone, and adding a new face or fingerprint makes
it unreadable. Forgetting My Pond on this phone, or unpairing it, removes it.

Your phone also keeps ordinary preferences: your Pond's address on your network, which
screen you were last on, your settings. None of this leaves your phone.

## What your Pond receives

Everything the app does functionally — conversations, devices, schedules, everything —
happens between your phone and your Pond, over an encrypted connection that your phone
verifies is really your Pond and not something pretending to be it.

That includes what you choose to give Goose: what you type, what you say when you talk to
it, the photos and files you attach, and, when you ask for a ride fare, where you are. Each
of these is described in its own section below.

Your Pond is your hardware, in your home. Data that reaches it has not left your household,
and we have no access to it.

## Remote access, if you choose it

You can use the app without remote access, and the app will ask rather than assume. If you
decline, nothing in this section happens.

Remote access lets you reach your Pond when you are not at home. To do that, your phone and
your Pond have to be introduced to each other across the internet, and that introduction is
made by a coordination service we operate.

**What that service learns:**

- The cryptographic keys that identify your phone as a device on your own private network.
  These identify a device, not a person.
- The private network address assigned to your phone.
- When your phone connects and disconnects.

**What it does not learn:** anything you do. The connection between your phone and your
Pond is encrypted end to end. The coordination service introduces the two and then is not
part of the conversation. If your phone and your Pond cannot reach each other directly, the
traffic is passed through a relay, which carries it already encrypted and cannot read it.

Turning on remote access also requires approval on the Pond itself, from your home network.
We cannot enable it for you, and neither can anyone who has only your phone.

**Retention:** [NEEDS ANSWER — how long connection records and device keys are kept, and
what happens to them when a phone is unpaired]

## Notifications

When your Pond has something to tell you, it sends your phone a push notification through
Google's or Apple's notification service, because that is the only way to wake an app that
is not running.

Those messages are **empty**. They contain no text and no detail about what happened. Your
phone wakes up, connects to your Pond directly, and fetches the actual content from it.

This is deliberate, and it is the reason the app is built this way: it means the content of
your notifications never passes through Google or Apple. What they see is that your device
was pinged. What was in it, they do not have.

To make this work, your phone gives its notification token to your Pond, and your Pond
talks to Google or Apple directly. We are not in that path either.

## Your voice

**Voice mode.** When you open voice mode to talk to Goose, the app listens through the
microphone for you to speak, and records what you say. Only the stretches where you are
speaking are sent, to your Pond, which turns them into text; the copy on your phone is deleted
as soon as it has been sent. Apart from listening for your wake word, if you turn it on (below),
the microphone is used only while voice mode is open.

**Goose as your phone's assistant (Android).** If you choose Goose as your phone's digital
assistant, holding the side key opens Goose's voice orb over whatever app is open. It listens
in the same way as voice mode, and only while the orb is showing. Over the lock screen, Goose
answers only what needs nothing personal: your memories and notes, messages, calendar, cameras,
sensor history and anything bought or booked wait until you unlock the phone.

**Listening for your wake word (Android, off unless you turn it on).** If you turn on
listening for your wake word, the app listens through the microphone so that saying the phrase
opens the voice orb. While it listens, Android shows a notification that cannot be hidden, and
you can stop it from there. It listens whenever the Goose app is not already open, the lock
screen included.

- If your household's phrase is "Hey Goose", the phone recognises it itself. What it hears
  is checked a fraction of a second at a time and then discarded; nothing is written or sent
  anywhere unless the phone is unsure whether it heard the phrase, when that moment of speech
  goes to your Pond to be checked and nowhere else.
- For any other phrase, only your Pond can recognise it, using the pronunciations it has
  learned from your household. So the phone picks out stretches of speech, at most eight
  seconds each, and sends each one to your Pond, which answers only whether it heard the phrase.
  Your Pond does not keep the recording or what was said, and does not log it. Each stretch is
  held briefly on your phone until your Pond has answered, and is then deleted. This sends
  speech near your phone to your Pond, and nowhere else, which the setting says before you turn
  it on.

If you teach Goose your voice on a phone, that phone keeps, in the app's private storage, a
numerical summary of your voice and a score for each sentence you recorded, never the recording
itself, so that only voices taught on it can wake it. To make that summary it uses your Pond's
voice model, which it fetches from your Pond. Forgetting your voice, in Voice Match or by teaching
it again, deletes it from the phone as well as from your Pond, and uninstalling the app deletes it.
The wake test records you on the phone, scores the recording there, and deletes it; moments it is
unsure of go to your Pond to be checked, as when it listens.

The app does not use the microphone in the background for anything else.

## Camera, photos and files

The app uses your camera for two things.

- **Reading QR codes:** the pairing code your Pond displays, and the setup code on a
  smart-home device you are adding. The code is read on your phone. No photograph is saved,
  and no image is sent anywhere.
- **Taking a photo to send to Goose,** when you choose to.

You can also pick photos from your library, or files, to send to Goose. The app sees only
the photos and files you pick, never your whole library. Before a photo is sent it is made
smaller and saved afresh as a new picture, which leaves out its location and the other
details a camera records about it. A text file is read on your phone and sent as part of
your message. All of it goes to your Pond, and nowhere else.

## Your location

The app reads your location for four things. Three happen only while it is open. The fourth,
watching the places you save for reminders, happens in the background once you allow it, and only
on your phone. It never tracks where you go.

**A ride.** When you ask Goose for a ride fare, the app reads where you are once, precisely
enough for a driver to find you. That reading goes to your Pond, which sends it to Uber as the
pickup point, so Uber can price the ride and, if you confirm it, send a driver. Uber's own
privacy policy covers what Uber does with it. The reading goes from your Pond to Uber
directly; it does not pass through us, and your phone does not keep it after the ride.

**Where home is.** Your Pond has no GPS, so on its own it only knows the city its time zone
names. When your phone reaches your Pond on your home network, and you have already allowed
the app to use your location, the app tells your Pond where home is if your Pond's location is
still only a guess, and then says where your Pond now is. It does not ask again: allowing the app
your location is the answer. It never asks for location to do this, and never replaces a place
you set. You can also ask for it with Find my location in the app. Your phone names the place using its own map service (Google's on
Android, Apple's on iPhone), which is the same service that gives your phone its location. Your Pond keeps the place to about
110 metres, which is enough for the weather and nearby results, and not your exact house. Your
Pond refuses this from a phone that is not on your home network, so a phone away from home can
never move your household.

**Telling Goose where you are (off unless you turn it on).** If you turn on Tell Goose where
this phone is, each message you send carries the name of the place your phone is in, such as
"Westlands, Nairobi", so Goose can say where you are and not only where home is. Only the name
is sent, never your coordinates, and only to your Pond, which uses it for that one message. The
name is looked up at most every five minutes, while you are sending a message.

**Places you save for reminders.** When you save a place for a reminder, such as home or the
office, its position goes to your Pond, which keeps it with your reminders. If you then allow the
app to use your location all the time, your phone watches those places in the background, using
its own geofencing, so it can remind you when you arrive or leave. Your Pond hears only which
saved place it was and whether you arrived or left; where you are never leaves your phone. You can
stop this at any time by turning off location for the app in your phone's settings.

## Bluetooth

The app uses Bluetooth to find a new Pond near you, claim it with the code on its setup card,
and tell it which Wi-Fi network to join. It talks only to the Pond you pick, and only while you
are setting one up. On Android the app tells the system that Bluetooth is never used to work out
where you are, so it does not ask for your location to do this.

The list of Wi-Fi networks comes from your Pond, not from your phone. Your Wi-Fi password goes
from your phone to your Pond encrypted, under a key only the two of them share for that
connection, and your phone does not keep it. Your Pond keeps it the way your computer would, so it
can rejoin the network.

When this phone joins a Pond, it uses its own name (such as "Wanjiru's iPhone"), which you can
change first, so you can tell your devices apart in your Pond's list. That name goes to your Pond
and nowhere else.

## Security

- **Your connection to your Pond** is encrypted. The first time you pair, your phone records
  your Pond's identity, and from then on it refuses to talk to anything that cannot prove it is
  that same Pond, at home or away.
- **Your Pond's keys on this phone** (the session token, the token that renews it, your Pond's
  identity, and this phone's key to My Pond if you use one) are kept in the phone's own
  protected storage: the Keychain on iOS and encrypted storage on Android. They are not included
  in backups.
- **Remote access** is encrypted end to end between your phone and your Pond, and must be
  approved on your Pond, from your home network, before it works.
- **On your Pond**, the keys you give it for other services are stored encrypted. Your Pond can
  also keep all of its data (conversations, memories, profiles, face templates and those keys) in
  an encrypted volume, opened at start-up by your Pond's own security chip, with your admin card as
  the recovery key; then storage taken out of your Pond and read elsewhere shows nothing. Until the
  volume is set up, that data is ordinary files on your Pond, and your Pond's health check says
  which it is. On a Pond whose security fuses have not been set, its storage moved into another
  identical device may still open, so keep your Pond somewhere safe, as you would a computer.

No system is perfectly secure. If you believe your Pond or this phone has been compromised,
unpair this phone, remove it on your Pond's dashboard, and pair again.

## Where your data is processed

Your conversations, your household's data and the content of your notifications are processed
on your Pond, in your home. They do not travel to us, or to any server of ours, in any country.

The coordination service for remote access, if you turn it on, runs on servers we operate in
[NEEDS ANSWER: the countries where the coordination service and its relays run]. The records it
keeps are described under Remote access above.

## What we do not do

- We do not use any analytics service, and the app's own code collects no usage data.
- We do not use crash-reporting or attribution services.
- We do not serve advertising, and we do not use an advertising identifier.
- We do not read your contacts.
- We do not read your location except for the four uses described above, and in the background
  only to watch the places you saved for reminders, on your phone.
- We do not use the microphone except while you talk to Goose, or while listening for your wake
  word if you turn that on, which Android always shows in a notification.
- We do not look through your photo library. The app sees only the photos you pick.
- We do not track you across other apps or websites, and we never will.

These are not intentions: none of them is in the app's own code. Two components from Google
are in the app because it cannot work without them, and they report on their own operation:
**ML Kit**, which reads QR codes on your phone, and **Firebase Cloud Messaging**, which delivers
the app's empty wake-up notifications. Google documents that these can send Google technical
information about how they are working, such as their performance and errors, and not what you
do in the app. [NEEDS ANSWER: confirm on a release build what ML Kit and Firebase send, and
whether the app can turn it off, before publishing.]

## Children

The app is not directed at children. [NEEDS ANSWER — confirm the age rating being submitted
to each store, so this section matches it]

## Your choices and your rights

- **Decline remote access.** The app works without it, and you can turn it down when asked.
- **Turn it off later.** Unpairing releases this phone's access to your Pond, including
  its remote access. You pair again at home to come back. Turning remote access off also
  erases the map of your home network that your phone kept to reconnect quickly.
- **Remove a Pond you cannot reach.** If your Pond does not answer when you unpair, you
  can remove it from this phone instead. The phone forgets the Pond and everything it kept
  from your household; the Pond still lists the phone until you remove it on the Pond's
  dashboard.
- **Your data is on your own hardware.** Deleting it is something you do on your Pond, not
  something you ask us for. We do not hold a copy.

For the records held by the coordination service, and for any request about them:
[NEEDS ANSWER — contact address, and the deletion process]

## Who we are

[NEEDS ANSWER — the legal entity acting as data controller for the coordination service,
its registered address, and the countries it operates in. Both stores ask, and a privacy
policy without an identifiable controller is not acceptable to either.]

## Changes to this policy

If this policy changes in a way that affects what leaves your device, we will say so in the
app rather than quietly updating this page. The date at the top always reflects the current
version.

## Contact

[NEEDS ANSWER — a monitored address. Both stores check that it works.]
