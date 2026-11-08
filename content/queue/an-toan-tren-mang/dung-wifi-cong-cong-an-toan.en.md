---
title: Using public Wi-Fi safely: fake networks, HTTPS and sharing your phone's connection
tags: public wi-fi, https, fake network, hotspot, network safety
type: note
---

> [!TLDR]
> - Public Wi-Fi can be imitated by attackers with an identical name, so ask staff for the exact network name.
> - Only enter passwords and important information on HTTPS pages, and ideally postpone sensitive tasks to a trusted network.
> - Sharing your phone's connection with its own password is usually safer than café Wi-Fi.

## Introduction

Cafés, airports, hotels, libraries: free Wi-Fi is everywhere, and everyone wants to connect for convenience. Most of the time that is perfectly fine. But public networks have one characteristic: you share them with many strangers, and you do not control who is behind the router.

This article explains the main risks in plain language and gives habits that help you use public Wi-Fi with more peace of mind.

## Risk one: fake networks

An attacker can broadcast a Wi-Fi network with exactly the same name as the café's, for example with one extra character, or with the right name but no password. This kind of attack is often called an "evil twin". When you connect to the fake network, all your data passes through that person's device, and they can try to view or tamper with data that is not encrypted.

How to avoid it:

- **Ask staff for the exact network name and password** instead of picking whichever one looks most similar in the list.
- Be careful with networks that have no password, especially when two networks have nearly identical names.
- Turn off automatic connection to open networks on your phone and computer, so your device does not join a strange network just because the name matches.
- After you finish, choose "forget network" so the device does not remember it.

## Risk two: unencrypted data

When you visit a website, data can travel in two ways. With plain HTTP, the content is sent as readable text, and anyone along the path can read it. With **HTTPS**, the content is encrypted between your browser and the site's server, so someone in the middle only sees scrambled data.

Modern browsers show a padlock icon or a "not secure" warning for pages that do not use HTTPS. Habits to adopt:

- When logging in or entering important information, check that the page address starts with `https://`.
- **Do not click past certificate warnings** from your browser just to get in quickly. That warning may itself be a sign that someone is interfering with the connection.
- Phone apps from major services usually encrypt their connections automatically, but you should still update apps and the operating system regularly to patch known security flaws.

Note: HTTPS protects what you exchange with the website, but it does not turn a fake network into a safe one. It is one layer of protection, not a reason to let your guard down.

## Risk three: being lured to a fake page

Many public networks show a login page when you connect (also called a captive portal). An attacker can build a fake page that asks you to enter your social media or email account to "confirm". The principle: a public network only needs you to accept its terms or enter a code provided by the venue, never your email password. Recognizing these lures is similar to what is described in [[Spotting scam messages and calls: five signs to stop before you click]], and remember to stop and think before entering any information.

## Habits for using public Wi-Fi safely

### Goal

Use the Internet in public places without exposing important accounts and data.

### Preparation

- An operating system and browser updated to the latest versions.
- Important accounts with two-step verification turned on. For details see [[Turning on two-step verification for email and social media: one more lock on your account]]. That way, even if a password leaks, the attacker is still missing one more step to get into the account.
- A phone hotspot (tethering), if your plan allows it.

### Steps

1. Confirm the exact network name with staff before connecting.
2. For sensitive tasks such as banking, payments, or changing passwords, **postpone them** until you are back on your home network, or use your phone's mobile data.
3. If you need to use it a lot, turn on **sharing your phone's connection**: give it its own network name, set a strong password using a modern encryption standard your phone supports (for example WPA2 or WPA3), and let only your own devices use it. This connection goes through your carrier instead of a stranger's router.
4. Turn off file sharing and the "discoverable" mode of your computer on public networks.
5. When you leave, turn off Wi-Fi or choose "forget network", and turn off the hotspot if you enabled it.

### Checking

Before typing a password on any page, look at the address bar again: is there `https://` and a padlock, and is the domain name spelled correctly? After a session on an unfamiliar network, if you see a login notification from an unknown device or place, change your password right away from a trusted network.

### Common mistakes

- Picking a network with a similar name to the venue without asking again.
- Clicking through a certificate warning in a hurry.
- Doing banking transactions on a public network.
- Leaving the phone hotspot without a password or with an easy-to-guess one, so strangers nearby can borrow it and may use up your data.
- Forgetting to turn off file sharing.

## Summary

Public Wi-Fi is not scary if you remember a few principles: confirm the correct network name, only enter important information on HTTPS pages, postpone sensitive tasks to a trusted network or use your phone's shared connection, and always turn on two-step verification for important accounts. A few seconds of checking each time you connect can save you a big headache.

## References

- [Evil twin (wireless networks), Wikipedia (English)](https://en.wikipedia.org/wiki/Evil_twin_(wireless_networks))
- [HTTPS, Wikipedia (Vietnamese)](https://vi.wikipedia.org/wiki/HTTPS)
- [Wi-Fi Protected Access, Wikipedia (English)](https://en.wikipedia.org/wiki/Wi-Fi_Protected_Access)
- [Tethering, Wikipedia (English)](https://en.wikipedia.org/wiki/Tethering)
