var http = require('http'),
    EventEmitter = require('events').EventEmitter,
    sys = require('sys'),
    url = require('url'),
    crypto = require('crypto'),
    xml2js = require('xml2js');

// these IP addresses are subject to change
var ALLOWED_IPS = ["81.20.151.38","81.20.148.122","209.20.83.207"];

/**
 * new FortumoSMSServer(options)
 * - options (Object): options for the server
 *   possible properties of the object:
 *   - service_id (String): Unique public service ID, 32 chars (MD5 hash)
 *   - secret (String): Unique private API secret, 32 chars (MD5 hash)
 *   - allowed_ips (Array): Optional array of allowed IP addresses. if not set
 *     ALLOWED_IPS will be used. Requests coming from an IP that is not in the
 *     list will be rejected
 *   - charset (String): Charset for sent and received data, defaults to UTF-8
 *   - config_url (String): URL for service settings
 *     Should be somethig like: http://api.fortumo.com/api/services/2/XXX.YYY.xml
 *  
 * Creates a new server to accept SMS messages from Fortumo. Checks if anything
 * posted to /_incoming_sms is a valid SMS and emits a "sms" event if needed
 * See example.js for usage.
 * 
 * FortumoSMSServer is an event emitter. Emits event "sms" on incoming SMS message
 * 
 * NB! SET http://yourcerver.com/_incoming_sms AS THE RECEIVING URL IN FORTUMO
 **/
var FortumoSMSServer = function(options){
    options = options || {};
    EventEmitter.call(this);
    this.current = "";
    this.http_server = false;

    this.service_id = options.service_id;
    this.secret = options.secret;
    this.charset = options.charset || "utf-8";
    this.allowed_ips = options.allowed_ips || ALLOWED_IPS;
    this.config_url = options.config_url;
}
sys.inherits(FortumoSMSServer, EventEmitter);

// export
this.FortumoSMSServer = FortumoSMSServer;


////////// PUBLIC METHODS //////////

/**
 * FortumoSMSServer#listen(server) -> undefined
 * - server (Object | Number): HTTP server instance or port number
 * 
 * Starts listening requests for "/_incoming_sms"
 * If server is a HTTP server instance then a new route ise added to it
 * automatically. If the server is a port number a new server is set up
 * to listen this port.
 * 
 *     // 1. Add a new route to an existing server
 * 
 *     // set up a http server to listen on port 80
 *     var httpserver = http.createServer(function(req, res){
 *         res.writeHead(200, {'Content-Type': 'text/plain'});
 *         res.end("You requested "+req.url);
 *     });
 *     httpserver.listen(80);
 *     
 *     // inject new route to the existing http server
 *     var sms_server = new FortumoSMSServer({service_id:"XXX",secret:"YYY"});
 *     sms_server.listen(httpserver)
 * 
 *     // 2. Set up a new http server instance on specified port
 *     
 *     // start listening on the specified port
 *     var sms_server = new FortumoSMSServer({service_id:"XXX",secret:"YYY"});
 *     sms_server.listen(80);
 * 
 **/
FortumoSMSServer.prototype.listen = function(server){
    
    if(typeof server == "number"){ // only port number given
        this.http_server = http.createServer(this._httpReceiver.bind(this));
        this.http_server.listen(server);
    }else if(typeof server == "object"){ // http server given
        this.http_server = server;
        var old_listeners = this.http_server.listeners('request');
        this.http_server.removeAllListeners('request');
        this.http_server.addListener('request', (function(req, res){
            if(this._httpReceiver(req, res))return;
            for (var i = 0, len = old_listeners.length; i < len; i++){
                old_listeners[i].call(this.http_server, req, res);
            }
        }).bind(this));
        
    }

}

/**
 * FortumoSMSServer#getConfig(callback) -> Boolean
 * - callback (Function): callback function for loaded data. Has two parameters:
 *   - data (Object): XML in an Object form, property "@" is for node attributes
 *   - error (String): Set if an error occured
 * 
 * Loads service configuration as an object from a predefined XML service url.
 * Has a list of countries, keywords etc.
 * 
 * NB! Can only be used if options.config_url was set with new FortumoSMSServer
 * 
 *     var fortumo = new FortumoSMSServer({..., config_url: "http://api.fortumo..."})
 **/
FortumoSMSServer.prototype.getConfig = function(callback){
    if(!this.config_url || typeof callback!="function")
        return false;
    
    return loadFromUrl(this.config_url, function(data, error){
        if(error){
            callback(null, error);
            return;
        }
        var parser = new xml2js.Parser();
        parser.addListener('end', function(result) {
            callback(result, null);
        });
        parser.parseString(data);
    }, this.charset);
}

////////// PRIVATE METHODS //////////

/**
 * FortumoSMSServer#_httpReceiver(req, res) -> Boolean
 * - req (Object): HTTP request object
 * - res (Object): HTTP response object
 * 
 * Router to check if the requested URL is /_incoming_sms
 * If it is then the HTTP server routing chain is broken (return falue is TRUE)
 * and _handleIncomingSMS is ran. Otherwise id does nothing.
 **/
FortumoSMSServer.prototype._httpReceiver = function(req, res){
    var path = url.parse(req.url).pathname;
    if(path == "/_incoming_sms"){
        this._handleIncomingSMS(req, res);
        return true;
    }
    return false;
}

/**
 * FortumoSMSServer#_handleIncomingSMS(req, res) -> undefined
 * - req (Object): HTTP request object
 * - res (Object): HTTP response object
 * 
 * Checks if the SMS is valid (coming from a legal IP, has a correct signature)
 * and emits event "sms" if everything is correct. The emitted event has 2 params
 * - sms_data (Object): Request data in object form.  ie. sms_data.message is the message body
 * - response (Function): Callback function to send a message back to the sender
 *   takes the message as a parameter
 **/
FortumoSMSServer.prototype._handleIncomingSMS = function(req, res){
    res.writeHead(200, {'Content-Type': 'text/plain; charset='+this.charset});
    
    var sms = url.parse(req.url, true).query || {},
        response_sent = false;
    
    // test IP
    if(ALLOWED_IPS.indexOf(req.socket.remoteAddress)<0){
        return this._sendResponse(req, res, "Error: Invalid source IP");
    }

    // check service id
    if(sms.service_id!=this.service_id)
        return this._sendResponse(req, res, "Error: Invalid service");

    // calculate signature
    if(!this._checkHash(sms))
        return this._sendResponse(req, res, "Error: Invalid signature");
    
    // emit the SMS to the listeners
    this.emit("sms", sms, (function(msg){
        // allow only 1 response per request, ignore following
        if(!response_sent){
            this._sendResponse(req, res, msg);
            response_sent = true;
        }
    }).bind(this));
}

/**
 * FortumoSMSServer#_checkHash(sms) -> Boolean
 * - sms (Object): SMS data as an object
 * 
 * Calculates and checks the used signature. If returns False then the SMS data
 * can't be used.
 **/
FortumoSMSServer.prototype._checkHash = function(sms){
    var keys = Object.keys(sms),
        input = [], hash;
    
    for(var i=0, len=keys.length;i<len; i++){
        if(keys[i]!="sig"){
            input.push(keys[i]+"="+sms[keys[i]]);
        }
    }
    input.sort();
    hash = md5Hash(input.join("")+this.secret);
    return hash==sms["sig"];
}

/**
 * FortumoSMSServer#_sendResponse(req, res, message) -> undefined
 * - req (Object): HTTP request object
 * - res (Object): HTTP response object
 * - message (String): Response message to be sent to the original sender
 * 
 * Sends a response to the original sender
 **/
FortumoSMSServer.prototype._sendResponse = function(req, res, message){
    res.end(message);
}

////////// GENERAL UTILITY METHODS //////////

/**
 * loadFromUrl(address, callback, charset) -> Boolean
 * - address (String): URL of the address
 * - callback (Function): callback function to run with the URL body
 *   has two parameters:
 *   - data (String): Body of the URL
 *   - err (String): If set an error occured
 * - charset (String): Charset to be used, defaults to UTF-8
 * 
 * Loads the body of a webpage URL. Returns false if an error occured
 **/
var loadFromUrl = function(address, callback, charset){
    if(typeof callback!="function")
        return false;
    
    var urlInfo = url.parse(address, false),
        host = http.createClient(((urlInfo.protocol === 'http:') ? 80 : 443), urlInfo.hostname),
        request = host.request('GET', urlInfo.pathname, {'host': urlInfo.hostname});

    request.on('response', function (response) {
        if(response.statusCode!=200){
            callback(null, "Statuscode "+response.statusCode)
            return false;
        }
        var data = "";
        response.setEncoding(charset || "UTF-8");
        
        response.on('data', function (chunk) {
            data += chunk;
        });
        response.on('end', function () {
            callback(data,null);
        });
    });
    
    request.end();
    return true;
}

/**
 * md5Hash(str) -> String
 * -str (String): String to be hashed
 * 
 * Creates a MD5 hash from a string
 **/
var md5Hash = function(str){
    var hash = crypto.createHash('md5');
    hash.update(str);
    return hash.digest("hex").toLowerCase();
}
