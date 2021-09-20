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

    if (intent == "get_lines") {
        console.log("In get_lines fallback intent");
        //console.log(req.body);

        console.log(JSON.parse(req.body.queryResult.parameters.lines)); // => toto

        // URL = "https://ws.infotbm.com/ws/1.0/get-realtime-pass/" + toto.id.split("TBC:SP:")[0] + "/" + "23"

        res.send({
            fulfillmentMessages: [
                {
                    text: {
                        text: ["Hello get_lines"],
                    },
                },
            ],
        });
    }

    if (intent == "Default Fallback Intent") {
        // console.log("In default fallback intent");
        let contextParameters = req.body.queryResult.outputContexts;
        // console.log(contextParameters);

        // If we have data in the customContext
        if (checkForCustomContext(contextParameters)) {
            let parameters = getContextParameters(contextParameters);

            if (parameters.stop_query) {
                // We have some stop_query already registered

                for (const stop of parameters.stop_query) {
                    if (stop.name + " (" + stop.city + ")" == query) {
                        return axios({
                            method: "GET",
                            url: stop.url,
                            data: "",
                        }).then((response) => {
                            let data = response.data;
                            //console.log(data);

                            let lines = [];

                            for (const stopPoint of data.stopPoints) {
                                for (const route of stopPoint.routes) {
                                    lines.push("ligne " + route.id.split(":TBC:")[1].split("_R")[0]);
                                }
                            }

                            let quickReplies = [...new Set(lines)];

                            let entities = [];

                            for (const stopPoint of data.stopPoints) {
                                for (const route of stopPoint.routes) {
                                    entities.push({
                                        value: JSON.stringify({ id: stopPoint.id, name: stopPoint.name, route: route }),
                                        synonyms: ["ligne " + route.id.split(":TBC:")[1].split("_R")[0]],
                                    });
                                }
                            }

                            console.log(entities);

                            res.send({
                                fulfillmentMessages: [
                                    {
                                        quickReplies: {
                                            title: "J'ai trouvé les lignes suivantes",
                                            quickReplies: quickReplies,
                                        },
                                        //platform: "DIALOGFLOW_CONSOLE",
                                    },
                                ],
                                sessionEntityTypes: [
                                    {
                                        name: session + "/entityTypes/lines",
                                        entities: entities,
                                        entityOverrideMode: "ENTITY_OVERRIDE_MODE_OVERRIDE",
                                    },
                                ],
                            });
                        });

                        // res.send({
                        //     fulfillmentMessages: [
                        //         {
                        //             text: {
                        //                 text: ["Pour " + query + " j'ai trouvé ça :", stop.url],
                        //             },
                        //         },
                        //     ],
                        // });
                        //return;
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
            let entities = [];
            for (const stop of response.data) {
                quickReplies.push(stop.name + " (" + stop.city + ")");
                entities.push({});
            }
            res.send({
                fulfillmentMessages: [
                    // {
                    //     text: {
                    //         text: ["J'ai fait une recherche d'arrêt."],
                    //     },
                    // },
                    {
                        quickReplies: {
                            title: "J'ai trouvé les arrêts suivants.",
                            quickReplies: quickReplies,
                        },
                        //platform: "DIALOGFLOW_CONSOLE",
                    },
                ],
                outputContexts: [
                    {
                        name: session + "/contexts/customContext",
                        lifespanCount: 99,
                        parameters: {
                            stop_query: response.data,
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
