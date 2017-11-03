const express = require("express");
const rp = require("request-promise");
const watson = require("watson-developer-cloud");
const cfenv = require("cfenv");
const app = express();
const server = require("http").createServer(app);
const io = require('socket.io')(server);
const serviceCredentials = require('./service-credentials.json');

//Get the environment variables from Cloud Foundry
const appEnv = cfenv.getAppEnv();

// Serve the static files in the /public directory
app.use(express.static(__dirname + '/public'));

var conversation = new watson.ConversationV1({
  username:serviceCredentials.conversation.username,
  password:serviceCredentials.conversation.password,
  version_date: watson.ConversationV1.VERSION_DATE_2017_05_26
});

var workspace = serviceCredentials.conversation.workspaceID;
var context = {};

// Create an instance of the Discovery object
var discovery = new watson.DiscoveryV1({
  username: serviceCredentials.discovery.username,
  password: serviceCredentials.discovery.password,
  version_date: watson.DiscoveryV1.VERSION_DATE_2017_04_27
});

var environmentId = serviceCredentials.discovery.environmentID;
var collectionId = serviceCredentials.discovery.collectionID;


// start server on the specified port and binding host
server.listen(appEnv.port, '0.0.0.0', function() {
  // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});

io.on('connection', function(socket) {
  console.log('a user has connected');

  socket.on('chat message', function(msg) {

    console.log('message: ' + msg);
    io.emit('chat message', "you: " + msg);

    conversation.message({
      context: context,
      input: { text: msg },
      workspace_id: workspace
     }, function(err, response) {
         if (err) {
           console.error(err);
         } else {
           var reply = JSON.stringify(response.output.text[0], null, 2);
           context = response.context;

           var queryString = "";
           var answer = [];
           var city = "";

           if (context.best) {

             //TODO Have a way to show best hotl by city.
             //TODO Add average sentiment to the hotel info section

             console.log("best");
             console.log(context.best);

             queryString="term(hotel,count:50).average(enriched_text.docSentiment.score)";
             queryDiscovery(queryString, function(err, queryResults) {

               if (err) {
                 console.log(err);
               }

               var highestSent = 0;
               var currentSent;
               var bestHotel;

               queryResults = queryResults.aggregations[0].results;

               for (i=0;i<queryResults.length;i++) {

                 currentSent = queryResults[i].aggregations[0].value;

                 if (currentSent > highestSent) {
                   highestSent=currentSent;
                   bestHotel=queryResults[i].key;
                 }
               }

               io.emit('chat message', "The best hotel is " + bestHotel + " with an average sentiment of "+highestSent);


             });

           } else if (context.list) {

             console.log("list");
             console.log(context.list);
             city = context.list;
             queryString = "term(city,count:10).term(hotel,count:25)"
             queryDiscovery(queryString, function(err, queryResults) {

               if (err) {
                 console.log(err);
               }

               queryResults = queryResults.aggregations[0].results;
               for(var i=0; i<queryResults.length; i++) {

                 console.log(queryResults[i].key);
                 console.log(city);

                 if(queryResults[i].key == city) {

                   for(var x=0; x<queryResults[i].aggregations[0].results.length; x++) {

                     if (x == queryResults[i].aggregations[0].results.length - 1) {
                       answer[x] = "and " + queryResults[i].aggregations[0].results[x].key.replace(/_/g," ").replace(/\b\w/g, l => l.toUpperCase());
                       console.log(answer);
                     } else {
                       answer[x] = queryResults[i].aggregations[0].results[x].key.replace(/_/g," ").replace(/\b\w/g, l => l.toUpperCase()) + ", ";
                       console.log(answer);
                     }
                   }
                 }
               }

              // io.emit('chat message', "Hotel Bot: " + reply.replace(/"/g,"") + " " + answer);
              io.emit('chat message', "Hotel Bot: " + reply.replace(/"/g,""));
              for( var n=0;n<answer.length;n++) {
                console.log(answer[n]);
                io.emit('chat message',"--- " + answer[n]);
              }

             });
           } else if (context.hotel) {

             console.log(context);

              var chosenHotel = context.hotel[0].value;

              console.log("More Info on hotel: ");
              console.log(chosenHotel);

              queryString = "nested(enriched_text.docSentiment.type).filter(hotel::" + chosenHotel + ").term(enriched_text.docSentiment.type,count:10)"

              queryDiscovery(queryString, function(err, queryResults) {

                if (err) {
                  console.log(err);
                }
                console.log(queryResults.aggregations[0].aggregations[0].results);

                var positiveRevs = queryResults.aggregations[0].aggregations[0].results[0].matching_results;
                var negativeRevs = queryResults.aggregations[0].aggregations[0].results[1].matching_results;

                console.log(positiveRevs);
                console.log(negativeRevs);

                chosenHotel = chosenHotel.replace(/"/g,"").replace(/_/g," ").replace(/\b\w/g, l => l.toUpperCase());

                io.emit('chat message', "Hotel Bot: "+reply.replace(/"/g,"")+" "+chosenHotel+" tells us:");
                io.emit('chat message', "--- Out of "+ (positiveRevs+negativeRevs)+" total reviews, there are "+positiveRevs+" positive reviews and "+negativeRevs+" negative reviews.");

              });

           } else {
             io.emit('chat message', "Hotel Bot: " + reply);
           }

           if (context.system.branch_exited) {
             console.log("Exited");
             context = {};
           }
          //  console.log(context);
          //  console.log(JSON.stringify(response, null, 2));
         }
    });
  });
});

app.get('/', function(req, res){
  res.sendFile('index.html');
});

function queryDiscovery(query, callback) {

  discovery.query({
    environment_id: environmentId,
    collection_id: collectionId,
    aggregation: query
    }, function(err, response) {
       if (err) {
         console.error(err);
         callback(err, null);
       } else {
         //var results = JSON.stringify(response, null, 2);
        // console.log(results);
         callback(null, response);
       }
    });
}
