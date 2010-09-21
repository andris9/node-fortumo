var FortumoSMSServer = require("../lib/fortumo").FortumoSMSServer;

var options = {
    service_id: "34f7e5747de26810f1de920c1b8f9e4f", // public service ID
    secret:     "c0ed6ef48be0460c8ab90c4ebd23f7e7"  // secret service token
}

var fortumo = new FortumoSMSServer(options);
fortumo.listen(80);

fortumo.on("sms", function(sms, response){
    console.log(sms); // outputs the sms data to the console
    response("received!");
});