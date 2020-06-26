# Google App Scripts for tinynews

This repo is a collection of scripts for Google Docs add-ons used in publishing to tinynewsco sites.

## Howto

You can create, edit, test-run and publish apps scripts from the Google Script Editor at https://script.google.com/

More info tk.

## Create Article

* `Code.js` contains functions used to get content from the current Google Doc and to post it to Webiny's content API
* `Page.html` is what the add-on's sidebar displays
* `appsscript.json` tells the add-on what oauth scopes it can use (several are required for interacting with the document and with third party services)
