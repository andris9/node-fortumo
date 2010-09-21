var http = require('http'),
    FortumoSMSServer = require("../lib/fortumo").FortumoSMSServer;

/*
 * Example SMS payment receiver. Listens for incoming SMS messages,
 * sends the input to the console and responses to the sender with "received!"
 * 
 * To begin, set up SMS payment service here <fortumo.com/api/start>
 * 
 * NB! SET http://yourcerver.com/_incoming_sms AS THE RECEIVING URL IN FORTUMO
 */

// Service specific settings
var options = {
    service_id: "c4d18b86cc3bd0cccf5436b4995ba42d", // public service ID
    secret:     "7a518954b359471d31efaa2cefdfd8d7", // secret service token
                 // URL to XML configuration file
    config_url: "http://api.fortumo.com/api/services/2/c4d18b86cc3bd0cccf5436b4995ba42d.b17e2534250149da6d7ff605a574ecaa.xml"
}

var port = 80; // server port

// 1. Start a HTTP server
var httpserver = http.createServer(function(req, res){
    // return "hello world" for every request
    res.writeHead(200, {'Content-Type': 'text/plain; charset='+this.charset});
    res.write("This serice is set up with the following params (JSON dump):\n");
    
    // dump the service configs in a JSON format
    fortumo.getConfig(function(data, error){
        if(error){
            res.end('Error occured while loading data\n');
            return;
        }
        res.end(JSON.stringify(data));
    });
});
httpserver.listen(port);
console.log("Server listening on port "+port);


// 2. Start Fortumo SMS server to listen /_incoming_sms
var fortumo = new FortumoSMSServer(options);
fortumo.listen(httpserver); // inject to an already existing HTTP server

/*
// if no HTTP server is defined then only port number can be specified
    var fortumo = new FortumoSMSServer(options);
    fortumo.listen(port);
*/

// Listen for event "sms"
fortumo.on("sms", function(sms, response){
    console.log(sms); // outputs the sms data to the console
    response("received!");
});