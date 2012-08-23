[![build status](https://secure.travis-ci.org/andris9/node-fortumo.png)](http://travis-ci.org/andris9/node-fortumo)
node-fortumo
============

**node-fortumo** is **unofficial** binding for the Fortumo [SMS payment API](http://fortumo.ee/api/start). You can listen for incoming SMS messages and response to them with ease. See example/server.js for usage.

Usage
-----

#### Set up the account

  - Create an account at [fortumo.com](http://fortumo.com)
  - Set up a new Mobile Payments/Premium SMS API service [here](http://fortumo.ee/api/start)
  - Set `http://yourserver.com/_incoming_sms` as the receiving URL and optionally charset to UTF-8 if you want to use non-latin characters
  
#### Set up the server

  - install node-fortumo with
        npm install fortumo

Sample script
-------------

NB! Update `service_id` and `secret` in the script with the actual tokens of your service.

    var FortumoSMSServer = require("fortumo").FortumoSMSServer;

    var options = {
        service_id: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", // public service ID
        secret:     "YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY"  // secret service token
    }
    
    var fortumo = new FortumoSMSServer(options);
    fortumo.listen(80);
    
    fortumo.on("sms", function(sms, response){
        console.log(sms); // outputs the sms data to the console
        response("received!");
    });

See example/server.js for a better example