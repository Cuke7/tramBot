const express = require("express");
const { sessionEntitiesHelper } = require("actions-on-google-dialogflow-session-entities-plugin");
const { WebhookClient } = require("dialogflow-fulfillment");
const { Card, Suggestion } = require("dialogflow-fulfillment");
const app = express();

var axios = require("axios");

app.get("/", (req, res) => res.send("online"));

app.post("/dialogflow", express.json(), (req, res) => {
    const agent = new WebhookClient({ request: req, response: res });
    //console.log(req.body);
    let query = req.body.queryResult.queryText;
    let parameters = req.body.queryResult.parameters;
    let session = req.body.session;
    let intent = req.body.queryResult.intent.displayName;

    if (intent == "Default Fallback Intent") {
        // console.log("In default fallback intent");
        let contextParameters = req.body.queryResult.outputContexts;

        // If we have data in the customContext
        if (checkForCustomContext(contextParameters)) {
            let parameters = getContextParameters(contextParameters);

            //console.log(parameters);

            if (parameters.myData) {
                // We have some data stored in the context
                for (const data of parameters.myData) {
                    if (data.text == query) {
                        if (data.type == "stopData") {
                            // The query matches data on a stop, lets look for infos for lines
                            return axios({
                                method: "GET",
                                url: data.infos.url,
                                data: "",
                            }).then((response) => {
                                let data = response.data;

                                let lines = [];

                                let myData = [];

                                for (const stopPoint of data.stopPoints) {
                                    for (const route of stopPoint.routes) {
                                        let added = false;
                                        for (let data of myData) {
                                            // L'aller (le retour) est déjà présent, on ajoute donc le retour (l'aller).
                                            if (data.text == route.line.name) {
                                                data.infos.push({
                                                    id: stopPoint.id,
                                                    name: stopPoint.name,
                                                    route: route,
                                                });
                                                added = true;
                                            }
                                        }
                                        // La ligne n'est pas encore présente donc on l'ajoute
                                        if (!added) {
                                            myData.push({
                                                text: route.line.name,
                                                infos: [
                                                    {
                                                        id: stopPoint.id,
                                                        name: stopPoint.name,
                                                        route: route,
                                                    },
                                                ],
                                                type: "lineData",
                                            });
                                        }
                                        lines.push(route.line.name);
                                    }
                                }

                                let quickReplies = [...new Set(lines)];

                                res.send({
                                    fulfillmentMessages: [
                                        {
                                            quickReplies: {
                                                title: "J'ai trouvé les lignes suivantes",
                                                quickReplies: quickReplies,
                                            },
                                        },
                                    ],
                                    outputContexts: [
                                        {
                                            name: session + "/contexts/customContext",
                                            lifespanCount: 99,
                                            parameters: {
                                                myData,
                                            },
                                        },
                                    ],
                                });
                            });
                        }

                        if (data.type == "lineData") {
                            // The query matches data on a line, lets look for infos for lines

                            //console.log(data);
                            let results = [];
                            return (async () => {
                                for (let direction of data.infos) {
                                    let stopID = direction.id.split(":SP:")[1];
                                    let regex = /TB[A-Z]:/;

                                    let regex2 = /[A-Z].* /;

                                    console.log(direction);

                                    let lineID = direction.route.line.name.split(regex2)[1];

                                    console.log("Stop : " + stopID + ", line : " + lineID);

                                    console.log("https://ws.infotbm.com/ws/1.0/get-realtime-pass/" + stopID + "/" + lineID);

                                    results.push({
                                        direction: direction.route.name,
                                        time: await axios({
                                            method: "GET",
                                            url: "https://ws.infotbm.com/ws/1.0/get-realtime-pass/" + stopID + "/" + lineID,
                                            data: "",
                                        }),
                                    });
                                }

                                //console.log(results);

                                let messages = [];
                                // obj[Object.keys(obj)[0]];
                                for (const result of results) {
                                    let message = {
                                        text: {
                                            text: ["Destination " + result.direction + " : " + result.time.data.destinations[Object.keys(result.time.data.destinations)[0]][0].waittime_text + "."],
                                        },
                                    };

                                    messages.push(message);
                                }
                                res.send({
                                    fulfillmentMessages: messages,
                                });
                            })();

                            // return axios({
                            //     method: "GET",
                            //     url: data.infos.url,
                            //     data: "",
                            // }).then((response) => {
                            //     res.send({
                            //         fulfillmentMessages: [
                            //             {
                            //                 text: {
                            //                     text: ["We had some data in lineData"],
                            //                 },
                            //             },
                            //         ],
                            //     });
                            // });
                        }
                    }
                }
            }
        }

        // First step, recherche de l'arrêt et propositions d'arrêt corrigés.
        return axios({
            method: "GET",
            url: "https://ws.infotbm.com/ws/1.0/get-schedule/" + encodeURIComponent(query),
            data: "",
        }).then((response) => {
            let quickReplies = [];

            let myData = [];

            for (const stop of response.data) {
                quickReplies.push(stop.name + " (" + stop.city + ")");
                myData.push({
                    text: stop.name + " (" + stop.city + ")",
                    infos: stop,
                    type: "stopData",
                });
            }
            res.send({
                fulfillmentMessages: [
                    {
                        quickReplies: {
                            title: "J'ai trouvé les arrêts suivants.",
                            quickReplies: quickReplies,
                        },
                    },
                ],
                outputContexts: [
                    {
                        name: session + "/contexts/customContext",
                        lifespanCount: 99,
                        parameters: {
                            myData,
                        },
                    },
                ],
            });
        });
    }
});

app.listen(process.env.PORT || 8080);

function checkForCustomContext(contextParameters) {
    let flag = false;
    for (const context of contextParameters) {
        if (context.name.includes("customcontext")) {
            flag = true;
        }
    }
    return flag;
}

function getContextParameters(contextParameters) {
    for (const context of contextParameters) {
        if (context.name.includes("customcontext")) {
            return context.parameters;
        }
    }
}
