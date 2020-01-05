import Decimal from "decimal.js";
// import * from "HelperFunctions";
import * as JSZip from "jszip";
import {JSZipObject} from "jszip";
import {isNumeric, unwrapParentheses} from "tslint";
import Log from "../Util";
import {IInsightFacade, InsightDataset, InsightDatasetKind, InsightResponse} from "./IInsightFacade";
// import {forEachComment} from "tslint";
/**
 * This is the main programmatic entry point for the project.
 */
export default class InsightFacade implements IInsightFacade {
    // public datasets: object[];
    public datasets = new Map();
    public insightDatasets: InsightDataset[] = [];
    public loadedDatasets= new Map();
    constructor() {
        const that = this;
        Log.trace("InsightFacadeImpl::init()");
        // load data from disk on creation of InsightFacade
        const fs = require("fs");
        if (!(fs.existsSync("cache"))) {
            fs.mkdirSync("cache");
        }
        fs.readdirSync("./cache/").forEach(function (file: any) {
            Log.trace("Constructor reading cache folder");
            if (file !== ".DS_Store") {
                const content = JSON.parse(fs.readFileSync("./cache/" + file));
                const filename = file;
                const idstring = filename.split("-")[0]; // string
                const kindstring = filename.split("-")[1]; // InsightDatasetKind.Courses or Rooms
                let num = 0;
                try {
                    content.forEach(function (cont: any) {
                        if (kindstring === "courses") {
                            if (cont["result"] !== undefined) {
                                const curr = (cont["result"]).length;
                                num = num + curr;
                            }
                        } else {
                            const curr = (cont["rooms"]).length;
                            num = num + curr;
                        }
                    });
                } catch {
                    Log.trace("error");
                }
                that.datasets.set(idstring, content);
                that.loadedDatasets.set(idstring, [kindstring, num]);
                that.insightDatasets.push({id: idstring, kind: kindstring, numRows: num});
            }
        });
    }

    public helperTree(ast: any) {
        if (ast.nodeName === "tbody") {
            return ast;
        } else if (ast.childNodes === undefined || ast.childNodes.length === 0) {
            return 0;
        }
        const that = this;

        let temps: any = 0;
        for (const node of ast.childNodes) {
            const a = that.helperTree(node);
            if (a !== 0) {
                temps = a;
                break;
            }
        }
        return temps;
    }
    public helperBuildingInfo(ast: any) {
        try {
            return ast.childNodes[6].childNodes[3].childNodes[31].childNodes[10].childNodes[1].
                childNodes[3].childNodes[1].childNodes[3].childNodes[1].childNodes[1].childNodes[1];
        } catch {
            return 0;
        }
    }

    public getLatLon(url: string) {
        return new Promise<any>(function (resolve, reject) {
            const http = require("http");
            http.get(url, (res: any) => {
                const { statusCode } = res;
                const contentType = res.headers["content-type"];

                let error;
                if (statusCode !== 200) {
                    error = new Error("Request Failed.\n" +
                        `Status Code: ${statusCode}`);
                } else if (!/^application\/json/.test(contentType)) {
                    error = new Error("Invalid content-type.\n" +
                        "Expected application/json but received ${contentType}");
                }
                if (error) {
                    Log.trace("error occurred");
                    // consume response data to free up memory
                    res.resume();
                    return;
                }

                res.setEncoding("utf8");
                let rawData = "";
                res.on("data", (chunk: any) => {
                    rawData += chunk;
                });
                res.on("end", () => {
                    try {
                        const parsedData = JSON.parse(rawData);
                        // const geoLocation: any = JSON.parse(parsedData);
                        resolve(parsedData);
                        // Log.trace(parsedData);
                    } catch (e) {
                        Log.error(e);
                    }
                });
            }).on("error", (e: any) => {
                Log.error("got error");
            });
        });
    }
    public addDataRoom(id: string, content: string, kind: InsightDatasetKind): Promise<InsightResponse> {
        const that = this;
        const fs = require("fs");
        const myzip = require("jszip");
        return new Promise<InsightResponse>(function (resolve, reject) {
            if (that.datasets.has(id) && fs.existsSync("./cache/" + id + "-" + kind)) {
                const response: InsightResponse = {code: 400, body: {error: "this dataset ID already exists"}};
                reject(response);
                return;
            }
            const parse5 = require("parse5");
            const loadDatasetPromises: Array<Promise<object>> = [];
            const indexBuilding = new Map();
            const buildings: any[] = [];
            myzip.loadAsync(content, {base64: true}).then(function (zip2: JSZip) {
                // extract index
                Log.trace("in loadAsync");
                zip2.files["index.htm"].async("text").then(function (data: any) {
                    Log.trace("in zip.2file for pasing");
                    let parsedIndex: any = [];
                    parsedIndex = parse5.parse(data); // index file
                    const index = that.helperTree(parsedIndex);
                    index.childNodes.forEach(function (node: any) {
                        if (node.nodeName === "tr") {
                            const a = node.childNodes[3];
                            const b = a.childNodes[0].value;
                            const c = b.trim().replace("\n", "");
                            indexBuilding.set(c, c);
                        }
                    });
                    // extract buildings
                    zip2.folder("campus").folder("discover").folder("buildings-and-classrooms")
                        .forEach(function (relativePath: string, file: JSZipObject) {
                            const p = file.async("text").then(async function success(fileData) {
                                // Log.trace("Extracting buildings");
                                const parsedBuilding = parse5.parse(fileData);
                                const tbody = that.helperTree(parsedBuilding);
                                const test = file.name.replace("campus/discover/buildings-and-classrooms/", "");
                                if (indexBuilding.has(test)) {
                                    const buildingObj: any = {};
                                    const roomArray: object[] = [];
                                    // Log.trace(parsedBuilding);
                                    const buildingInfo = that.helperBuildingInfo(parsedBuilding);
                                    if (buildingInfo === 0) {
                                        return tbody;
                                    } else {
                                        buildingObj["fullname"] =
                                            buildingInfo.childNodes[1].childNodes[0].childNodes[0].value;
                                        const a = buildingObj["shortname"] = test; // DMP
                                        buildingObj["address"] =
                                            buildingInfo.childNodes[3].childNodes[0].childNodes[0].value;
                                        const url = "http://skaha.cs.ubc.ca:11316/api/v1/team82/" +
                                            buildingObj.address.replace(new RegExp(" ", "g"), "%20");
                                        const latlon = await that.getLatLon(url); // .then( function (latLon: any) {
                                        //     // do stuff with lat lon here
                                        //     buildingObj["lat"] = latLon.lat;
                                        //     buildingObj["lon"] = latLon.lon;
                                        // });
                                        buildingObj["lat"] = latlon.lat;
                                        buildingObj["lon"] = latlon.lon;
                                        // check if there's rooms
                                        if (tbody === 0) {
                                            return tbody;
                                        } else {
                                            tbody.childNodes.forEach(function (node: any) {
                                                const roomObj: any = {};
                                                if (node.nodeName === "tr") {
                                                    const b = roomObj["number"] =
                                                        node.childNodes[1].childNodes[1].childNodes[0].
                                                        value.toString();
                                                    roomObj["fullname"] =
                                                        buildingInfo.childNodes[1].childNodes[0].childNodes[0].value;
                                                    roomObj["shortname"] = test;
                                                    roomObj["address"] =
                                                        buildingInfo.childNodes[3].childNodes[0].childNodes[0].value;
                                                    roomObj["lat"] = buildingObj["lat"];
                                                    roomObj["lon"] = buildingObj["lon"];
                                                    roomObj["name"] = a + "_" + b;
                                                    roomObj["seats"] =
                                                        node.childNodes[3].childNodes[0].value.trim().
                                                        replace("\n", "");
                                                    roomObj["type"] =
                                                        node.childNodes[7].childNodes[0].value.trim().
                                                        replace("\n", "");
                                                    roomObj["furniture"] =
                                                        node.childNodes[5].childNodes[0].value.trim().
                                                        replace("\n", "");
                                                    roomObj["href"] = node.childNodes[9].childNodes[1].childNodes[0]
                                                        .parentNode.attrs[0].value;
                                                    roomArray.push(roomObj);
                                                }
                                            });
                                            buildingObj["rooms"] = roomArray;
                                            buildings.push(buildingObj);
                                        }
                                    }
                                } else {
                                    return tbody;
                                }
                            }).catch(function (error: any) {
                                Log.error(error);
                                const response: InsightResponse = {code: 400, body: {error}};
                                reject(response);
                                return;
                            });
                            loadDatasetPromises.push(p);
                        });
                    Promise.all(loadDatasetPromises).then(function (result: any) {
                        result = buildings;
                        Log.trace("inside Promise.all");
                        let allempty = true;
                        buildings.forEach(function (building: any) {
                            if (building.result !== []) {
                                allempty = false;
                            }
                        });
                        if (!allempty) {
                            // that.datasets.set(id, buildings);
                            let num = 0;
                            buildings.forEach(function (cont: any) {
                                if (cont["rooms"] !== undefined) {
                                    const curr = cont["rooms"].length;
                                    num = num + curr;
                                }
                            });
                            const idstring = id;
                            that.datasets.set(id, buildings);
                            that.loadedDatasets.set(id, ["rooms", num]);
                            that.insightDatasets.push({id: idstring, kind: InsightDatasetKind.Rooms, numRows: num});
                            fs.writeFile("./cache/" + id + "-" + kind.toString(),
                                JSON.stringify(buildings), function (err: any) {
                                    if (err) {
                                        return Log.error(err);
                                    }
                                    Log.trace("Room file created!!!");
                                });
                            const response: InsightResponse = {code: 204, body: result};
                            resolve(response);
                        } else {
                            const response: InsightResponse = {code: 400, body: {error: "0 rooms"}};
                            reject(response);
                            return;
                        }
                    }).catch(function (error: any) {
                        Log.error(error);
                        const response: InsightResponse = {code: 400, body: {error}};
                        reject(response);
                    });
                }).catch(function (error: any) {
                    Log.error(error);
                    const response: InsightResponse = {code: 400, body: {error}};
                    reject(response);
                });
            }).catch(function (error: any) {
                Log.error(error);
                const response: InsightResponse = {code: 400, body: {error: "loadAsync not working"}};
                reject(response);
            });
        });
    }
    public addDatasetCourse (id: string, content: string, kind: InsightDatasetKind): Promise<InsightResponse> {
        const that = this;
        const myzip = require("jszip");
        const fs = require("fs");
        return new Promise<InsightResponse>(function (resolve, reject) {
            if (that.datasets.has(id) && fs.existsSync("./cache/" + id + "-" + kind)) {
                const response: InsightResponse = {code: 400, body: {error: "this dataset ID already exists"}};
                reject(response);
                return;
            }
            // const courses: object[] = [];
            const loadDatasetPromises: Array<Promise<object>> = [];
            myzip.loadAsync(content, {base64: true}).then(function (zip: JSZip) {
                Log.trace("in loadAsync");
                const courses: object[] = [];
                zip.folder("courses").forEach(function (relativePath: string, file: JSZipObject) {
                    const p = file.async("text").then(function success(fileData) {
                        // Log.trace("read each course");
                        // for each file, 2 json objects, one is an array of json objects, the other is a rank
                        const course = JSON.parse(fileData);
                        courses.push(course);
                        return course;
                    }).catch(function (error: any) {
                        Log.error(error);
                        const response: InsightResponse = {code: 400, body: {error : "failed read coursesdat" + error}};
                        reject(response);
                        return;
                    });
                    loadDatasetPromises.push(p);
                });
                Promise.all(loadDatasetPromises).then(function (result: any) {
                    let allempty = true;
                    courses.forEach(function (coursef: any) {
                        if (coursef.result !== []) {
                            allempty = false;
                        }
                    });
                    if (!allempty) {
                        Log.trace("Load");
                        const response: InsightResponse = {code: 204, body: {result}};
                        let num = 0;
                        courses.forEach(function (section: any) {
                            if (section["result"] !== undefined) {
                                const curr = section["result"].length;
                                num = num + curr;
                            }
                        });
                        const idstring = id;
                        that.datasets.set(id, courses);
                        that.loadedDatasets.set(id, ["courses", num]);
                        that.insightDatasets.push({id: idstring, kind: InsightDatasetKind.Courses, numRows: num});
                        fs.writeFile("./cache/" + id + "-" + kind.toString(),
                            JSON.stringify(courses), function (err: any) {
                                if (err) {
                                    return Log.error(err);
                                }
                                Log.trace("Course file created!!!");
                            });
                        resolve(response);
                    } else {
                        const response: InsightResponse = {code: 400, body: {error: "All courses of 0 sections"}};
                        reject (response);
                        return;
                    }
                }).catch(function (error: any) {
                    Log.error(error);
                    const response: InsightResponse = {code: 400, body: {error: "Promise.all failed" + error}};
                    reject(response);
                });
            }).catch(function (error: any) {
                Log.error(error);
                const response: InsightResponse = {code: 400, body: {error: "load Async failed" + error}};
                reject (response);
            });
        });
    }

    public addDataset(id: string, content: string, kind: InsightDatasetKind): Promise<InsightResponse> {
        const that = this;
        return new Promise<InsightResponse>(function (resolve, reject) {
            if (kind === "rooms") {
                that.addDataRoom(id, content, kind).then(function (result: any) {
                    const response: InsightResponse = {code: 204, body: result};
                    resolve(response);
                }).catch(function (error: any) {
                    Log.error(error);
                    const response: InsightResponse = {code: 400, body: {error: "Inside addDataset" + error}};
                    reject(response);
                });
            } else if (kind === "courses") {
                that.addDatasetCourse(id, content, kind).then(function (result: any) {
                    const response: InsightResponse = {code: 204, body: result};
                    resolve(response);
                }).catch(function (error: any) {
                    Log.error(error);
                    const response: InsightResponse = {code: 400, body: {error: "Inside addDataset" + error}};
                    reject(response);
                });
            } else { reject({code: 400, body: {error: "wrong kind of dataset requested"}}); }
        });
    }

    // addDataset(id: string, content: string): Promise<InsightResponse> {
    //     return new Promise<InsightResponse>(function (fulfill,reject){
    //
    //
    //         // console.log("after reject");
    //
    //         if (id == 'courses') {
    //             fs.access("" + id + ".json", function (err:any) {
    //                 if (err) {  // if the file doesn't exist
    //                     storeZip(id, content).then(function (param:any) {
    //                         fulfill({code:204, body:"The operation was successful and the id was new"});
    //                     }).catch(function (err: any) {
    //                         // console.log("in catch block");
    //                         reject({code: 400, body: {"error": "the operation was unsuccessful"}});
    //                     });
    //                 } else{  // the file exist
    //                     storeZip(id, content).then(function(param:any) {
    //                         fulfill({code:201, body:"The operation was successful and the id already exist"});
    //                     }).catch(function (err: any) {
    //                         reject({code: 400, body: {"error": "the operation was unsuccessful"}});
    //                     });
    //                 }
    //             });
    //         } else if (id == 'rooms') {
    //             fs.access( id + ".json", function(err:any) {
    //                 if (err) {
    //                     storeHTML(id, content).then(function (param: any) {
    //                         fulfill({code:204, body:"The operation was successful and the id was new"});
    //                     }).catch(function (err: any) {
    //                         reject({code: 400, body: {"error": "the operation was unsuccessful"}});
    //                     });
    //                 } else {
    //                     storeHTML(id, content).then(function (param: any) {
    //                         fulfill({code:201, body:"The operation was successful and the id already exist"});
    //                     }).catch(function (err: any) {
    //                         reject({code: 400, body: {"error": "the operation was unsuccessful"}});
    //                     });
    //                 }
    //             });
    //         } else {
    //             reject({code: 400, body: {"error": "the operation was unsuccessful"}});
    //         }
    //     });
    // }
    //
    public removeDataset(id: string): Promise<InsightResponse> {
        const that = this;
        const fs = require("fs");
        return new Promise(function (resolve, reject) {
            if (that.datasets.has(id.toString())) {
                that.datasets.delete(id);
                that.loadedDatasets.delete(id);
            }
            try {
                const path = "./cache/" + id;
                if (fs.existsSync(path + "-" + "courses")) {
                    // fs.writeFile("./cache/" + id, JSON.stringify(that.datasets.get(id)), function (err: any) {
                    //     if (err) {
                    //         return Log.error(err);
                    //     }
                    //     Log.trace("file created!!!");
                    // });
                    fs.unlink("./cache/" + id + "-" + "courses", function (err: any) {
                        if (err) {
                            Log.error(err);
                            const response: InsightResponse = {code: 404, body: {error: err}};
                            reject(response);
                        } else {
                            const response: InsightResponse = {code: 204, body: {result: "removed from directory"}};
                            resolve(response);
                        }
                    });
                }  else if (fs.existsSync(path + "-" + "rooms")) {
                    fs.unlink("./cache/" + id + "-" + "rooms", function (err: any) {
                        if (err) {
                            Log.error(err);
                            const response: InsightResponse = {code: 404, body: {error: err}};
                            reject(response);
                        } else {
                            const response: InsightResponse = {code: 204, body: {result: "removed from directory"}};
                            resolve(response);
                        }
                    });
                } else {
                    const response: InsightResponse = {code: 404, body: {error: "dataset does not exist on disk"}};
                    reject(response);
                }
            } catch (error) {
                Log.error(error);
                const response: InsightResponse = {code: 404, body: {error}};
                reject(response);
            }
        });
    }
    public performQuery(query: any): Promise <InsightResponse> {
        const that = this;
        return new Promise(function (fulfill, reject) {
            // syntax check
            if (query === undefined || Object.keys(query).length === 0 || query.OPTIONS === undefined ||
                Object.keys(query.OPTIONS).length === 0) {
                const responses: InsightResponse = {code: 400, body: {error: "wrong EBNF format"}};
                reject(responses);
            }
            const optionColumn = query.OPTIONS.COLUMNS[0];
            if (optionColumn === undefined) {
                const responses: InsightResponse = {code: 400, body: {error: "Columns is empty"}};
                reject(responses);
            }
            const columns = query.OPTIONS.COLUMNS;
            if (columns.length === 0) {
                const responses: InsightResponse = {code: 400, body: {error: "there must be at least one column"}};
                reject(responses);
            }
            let id: string;
            columns.forEach(function (col: string) {
                if (col.includes("_")) {
                    id = col.split("_")[0];
                    return;
                }
            });
            // const id = optionColumn.split("_")[0];
            if (!that.loadedDatasets.has(id) && !that.datasets.has(id)) {
                const responses: InsightResponse = {code: 400, body: {error: "nonexistent dataset"}};
                reject(responses);
            }
            let datakind = "courses";
            if (that.loadedDatasets.get(id)[0] === "rooms") {
                datakind = "rooms";
            }
            let sectionsThatFulfill: any = [];
            let bodyToReturn: any = [];
            // empty where
            if (Object.keys(query.WHERE).length === 0) {
                sectionsThatFulfill = that.getAlldata(id);
            }
            // evaluate functions
            // const ts = require("fs");
            const questionObj = query.WHERE;
            const num = Object.keys(questionObj).length;
            const optionOrder = query.OPTIONS.ORDER;
            if (Object.keys(questionObj).length !== 0 && questionObj !== undefined) {
                // call helper functions that correspond to questionObj
                const questionObjKey = Object.keys(questionObj)[0];
                const questionObjVal = Object.values(questionObj)[0];
                if (questionObjVal === undefined || Object.keys(questionObjVal).length === 0) {
                    const responses: InsightResponse = {code: 400, body: {error: questionObjKey +
                            "wrong format"}};
                    reject(responses);
                }
                if (questionObjKey === "EQ" && that.ValidKeys(questionObjVal, datakind) &&
                    typeof Object.values(questionObjVal)[0] === "number") {
                    sectionsThatFulfill = that.eqFunction(Object.values(questionObj)[0], id);
                } else if (questionObjKey === "IS" && that.ValidKeys(Object.values(questionObj)[0], datakind)) {
                    sectionsThatFulfill = that.isFunction(Object.values(questionObj)[0], id);
                } else if (questionObjKey === "OR") {
                    sectionsThatFulfill = that.orFunction(Object.values(questionObj)[0], id);
                } else if (questionObjKey === "AND") {
                    sectionsThatFulfill = that.andFunction(Object.values(questionObj)[0], id);
                } else if (questionObjKey === "LT" && that.ValidKeys(Object.values(questionObj)[0], datakind) &&
                    typeof Object.values(questionObjVal)[0] === "number") {
                    sectionsThatFulfill = that.ltFunction(Object.values(questionObj)[0], id);
                } else if (questionObjKey === "GT" && that.ValidKeys(Object.values(questionObj)[0], datakind) &&
                    typeof Object.values(questionObjVal)[0] === "number") {
                    sectionsThatFulfill = that.gtFunction(Object.values(questionObj)[0], id);
                } else if (questionObjKey === "NOT") {
                    sectionsThatFulfill = that.notFunction(Object.values(questionObj)[0], id);
                } else {
                    sectionsThatFulfill = 0;
                }
                if (sectionsThatFulfill === 0) {
                    const responses: InsightResponse = {code: 400, body: {error: "error occurred"}};
                    reject(responses);
                }
            }
            if (questionObj === undefined) {
                const responses: InsightResponse = {code: 400, body: {error: "wrong format"}};
                reject(responses);
            }
            //  D2 ADD ONS //
            // if query has key TRANSFORMATION
            if (query.hasOwnProperty("TRANSFORMATIONS")) {
                // do syntactic and semantic checking
                if (query.TRANSFORMATIONS === undefined || Object.keys(query.TRANSFORMATIONS).length === 0) {
                    const response: InsightResponse = {code: 400, body: {error: "Wrong TRANSFORMATIONS FORMAT"}};
                    reject(response);
                }
                const transfMap = new Map();
                const transformations = query.TRANSFORMATIONS;
                // check GROUP and APPLY are in TRANSFORMATIONS
                if (transformations.hasOwnProperty("GROUP") && transformations.hasOwnProperty("APPLY")) {
                    const group = transformations.GROUP;
                    const apply = transformations.APPLY;
                    const applyKeys: any = [];
                    apply.forEach(function (applyObj: object) {
                        const akey = Object.keys(applyObj)[0];
                        applyKeys.push(akey);
                    });
                    columns.forEach(function (key: any) {
                        const colCheck = that.ValidColumnKey(key, datakind, applyKeys, columns);
                        if (!colCheck) {
                            const response: InsightResponse = {code: 400, body: {error: "Column Wrong"}};
                            reject(response);
                        }
                    });
                    if (group === undefined || group.length === 0) {
                        const response: InsightResponse = {code: 400, body: {error: "GROUP cannot be undefined" +
                                " or empty"}};
                        reject(response);
                    }
                    // check if the all keys in group and apply are also in columns
                    query.OPTIONS.COLUMNS.forEach(function (columnKey: string) {
                        if (group.indexOf(columnKey) < 0 && applyKeys.indexOf
                            (columnKey) < 0) {
                            const response: InsightResponse = {code: 400, body: {error: "key in COLUMNS is missing in" +
                                    "GROUP " + "or APPLY."}};
                            reject(response);
                        }
                    });
                    // group results
                    const groupResult = that.groupFunction(group, sectionsThatFulfill);
                    // applyFunk applied to each unique field in a group.
                    const returnArray: any = [];
                    // const groupResultSet = new Set(groupResult);
                    // for each group, do the APPLY computations
                    (Object.keys(groupResult)).forEach((keyy: any) => {
                        const aggregate: any = {};
                        const groupkeys: any = groupResult[keyy]["groupKey"]; // Each grouping
                        const sectionArray = groupResult[keyy]["sections"]; // is an array of sections: object
                        if (apply.length !== 0) {
                            const appliedObject =  that.applyFunction(apply, id, sectionArray);
                            if (appliedObject === 0) {
                                const response: InsightResponse = {code: 400, body: {error: "APPLY FORMAT IS WRONG"}};
                                reject(response);
                            }
                            appliedObject.forEach(function (computed: object) {
                                // check if it is in columns
                                let checkColumns = true;
                                const key = Object.keys(computed)[0];
                                if (columns.indexOf(key) < 0) {
                                    checkColumns = false;
                                }
                                if (checkColumns === true) {
                                    aggregate[key] = Object.values(computed)[0];
                                }
                            });
                        } else {
                            const keylist2 = Object.keys(groupkeys);
                            keylist2.forEach(function (key: any) {
                                let checkColumns = true;
                                if (columns.indexOf(key) < 0) {
                                    checkColumns = false;
                                    return 0;
                                }
                                if (checkColumns === true) {
                                    let keyTemp = Object.keys(groupkeys)[0].split("_")[1];
                                    keyTemp = that.convertKeyFunction(keyTemp);
                                    const val2 = that.convertValue(keyTemp, groupkeys[key]);
                                    aggregate[key] = val2;
                                }
                            });
                        }
                        const keylist = Object.keys(groupkeys);
                        keylist.forEach(function (key: any) {
                            let checkColumns = true;
                            if (columns.indexOf(key) < 0) {
                                checkColumns = false;
                                return 0;
                            }
                            if (checkColumns === true) {
                                let keyTemp = Object.keys(groupkeys)[0].split("_")[1];
                                keyTemp = that.convertKeyFunction(keyTemp);
                                const val2 = that.convertValue(keyTemp, groupkeys[key]);
                                aggregate[key] = val2;
                            }
                        });
                        returnArray.push(aggregate);
                    });
                    // TODO
                    bodyToReturn = (returnArray);
                    // result2 = that.applyFunction(apply, id, sectionsThatFulfill);
                } else {
                    const response: InsightResponse = {code: 400, body: {error: "TRANSFORMATION is missing GROUP " +
                            "or APPLY."}};
                    reject(response);
                }
            } else {
                // if no TRANSFORMATIONS, do as same in D1
                columns.forEach(function (key: any) {
                    const colCheck = that.ValidColumnKey(key, datakind, [], columns);
                    if (!colCheck) {
                        const response: InsightResponse = {code: 400, body: {error: "Column Wrong"}};
                        reject(response);
                    }
                });
                sectionsThatFulfill.forEach(function (section: any) {
                    const obj: any = {};
                    columns.forEach(function (col: string) {
                        const key = col.split("_")[1];
                        const keyconv = that.convertKeyFunction(key);
                        if (keyconv === "id") {
                            obj[col] = section[keyconv].toString();
                        } else {
                            const resultval = that.convertValFunction(keyconv, section);
                            obj[col] = resultval;
                        }
                        if (!that.ValidKeys(obj, datakind)) {
                            const responses: InsightResponse = {code: 400, body: {error: "invalid column"}};
                            reject(responses);
                        }
                    });
                    bodyToReturn.push(obj);
                });
            }
            // if SORT key exits:
            if (query.OPTIONS.hasOwnProperty("ORDER")) {
                const order = query.OPTIONS.ORDER;
                const response3 = that.sortFunction(order, bodyToReturn, columns);
                if (response3.code === 400) { reject(response3);
                } else {fulfill(response3); }
            } else {
                const response3: InsightResponse = {code: 200, body: {result: bodyToReturn}};
                fulfill(response3);
            }
        });
    }
    public sortFunction(order: any, bodyToReturn: any, columns: any): InsightResponse {
        // check symantics - check if it's in the columns object
        if (typeof order === "string") {
            if (columns.indexOf(order) < 0) {
                const response: InsightResponse = {code: 400, body: {error: "Key in SORT must also be in COLUMNS"}};
                return response;
            }
            bodyToReturn.sort(function (a: any, b: any) {
                if (a[order] < b[order]) {
                    return -1;
                }
                if (a[order] > b[order]) {
                    return 1;
                }
                return 0;
                // return a[order] - b[order];
            });
            const response2: InsightResponse = {code: 200, body: {result: bodyToReturn}};
            return response2;
        } else {
            order["keys"].forEach(function (key: string) {
                if (columns.indexOf(key) < 0) {
                    const response2: InsightResponse = {
                        code: 400, body:
                            {error: "Key in SORT must also be in COLUMNS."},
                    };
                    return response2;
                }
            });
            // if ORDER has just one order key
            const firstkeyVal = order["keys"][0];
            const numKeys = order["keys"].length;
            if (order["dir"] === "DOWN") {
                // for (let i = 0; i < order["keys"].length; ++i) {
                {
                    bodyToReturn.sort(function (a: any, b: any) {
                        for (const orderKey of order["keys"]) {
                            // Log.trace(bodyToReturn.toString());
                            // const orderKey = order["keys"][i];
                            if (a[orderKey] > b[orderKey]) {
                                // console.log("a < b");
                                return -1;
                            } else if (b[orderKey] > a[orderKey]) {
                                // console.log("b < a");
                                return 1;
                            }
                        }
                        return 0;
                    });
                }
            } else {
                bodyToReturn.sort(function (a: any, b: any) {
                    for (const orderKey of order["keys"]) {
                        // const orderKey = order["keys"][i];
                        if (a[orderKey] < b[orderKey]) {
                            // console.log("a < b");
                            return -1;
                        } else if (b[orderKey] < a[orderKey]) {
                            // console.log("b < a");
                            return 1;
                        }
                    }
                    return 0;
                });
            }
            const response: InsightResponse = {code: 200, body: {result: bodyToReturn}};
            return response;
        }
    }
    public capitalizeFirstLetter(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    public ValidColumnKey(key: any, kind: string, apply: any, columns: any): boolean {
        const that = this;
        if (key.includes("_")) {
            const keyfields = key.split("_");
            const id = keyfields[0];
            const keyname = keyfields[1];
            if (!that.loadedDatasets.has(id) && !that.datasets.has(id)) {
                const responses: InsightResponse = {code: 400, body: {error: "nonexistent dataset"}};
                throw(responses);
            }
            switch (kind) {
                case "rooms":
                    if (keyname === "fullname") {
                        return true;
                    } else if (keyname === "shortname") {
                        return true;
                    } else if (keyname === "number") {
                        return true;
                    } else if (keyname === "address") {
                        return true;
                    } else if (keyname === "lat") {
                        return true;
                    } else if (keyname === "lon") {
                        return true;
                    } else if (keyname === "seats") {
                        return true;
                    } else if (keyname === "type") {
                        return true;
                    } else if (keyname === "furniture") {
                        return true;
                    } else if (keyname === "href") {
                        return true;
                    } else if (keyname === "name") {
                        return true;
                    } else {
                        return false;
                    }
                case "courses":
                    if (keyname === "dept") {
                        return true;
                    } else if (keyname === "id") {
                        return true;
                    } else if (keyname === "avg") {
                        return true;
                    } else if (keyname === "instructor") {
                        return true;
                    } else if (keyname === "title") {
                        return true;
                    } else if (keyname === "pass") {
                        return true;
                    } else if (keyname === "fail") {
                        return true;
                    } else if (keyname === "audit") {
                        return true;
                    } else if (keyname === "uuid") {
                        return true;
                    } else if (keyname === "year") {
                        return true;
                    } else {
                        return false;
                    }
            }
        } else {
            if (apply.length > 0) {
                if (apply.indexOf(key) < 0) {
                    return false;
                } else { return true; }
            } else {
                return false;
            }
        }
    }
    public courseValidKey(key: string) {
        const validKeys = ["id", "Professor", "Title", "Subject", "Course", "Avg", "Pass", "Fail", "Audit", "Year"];
        if (!validKeys.includes(key)) {
            return false;
        } else {
            return true;
        }
    }
    // checks valid key-pair types in the query
    public ValidKeys(keyobj: any, kind: string): boolean {
        const that = this;
        const keyfields = Object.keys(keyobj)[0].split("_");
        const id = keyfields[0];
        if (!that.loadedDatasets.has(id) && !that.datasets.has(id)) {
            const responses: InsightResponse = {code: 400, body: {error: "nonexistent dataset"}};
            throw(responses);
        }
        const keyname = keyfields[1];
        switch (kind) {
            case "rooms":
                if (keyname === "fullname") {
                    return (typeof (keyobj[id + "_" + keyname]) === "string");
                } else if (keyname === "shortname") {
                    return (typeof keyobj[id + "_" + keyname] === "string");
                } else if (keyname === "number") {
                    return (typeof keyobj[id + "_" + keyname] === "string");
                } else if (keyname === "address") {
                    return (typeof keyobj[id + "_" + keyname] === "string");
                } else if (keyname === "lat") {
                    return (typeof keyobj[id + "_" + keyname] === "number");
                } else if (keyname === "lon") {
                    return (typeof keyobj[id + "_" + keyname] === "number");
                } else if (keyname === "seats") {
                    return (typeof keyobj[id + "_" + keyname] === "number");
                } else if (keyname === "type") {
                    return (typeof keyobj[id + "_" + keyname] === "string");
                } else if (keyname === "furniture") {
                    return (typeof keyobj[id + "_" + keyname] === "string");
                } else if (keyname === "href") {
                    return (typeof keyobj[id + "_" + keyname] === "string");
                } else if (keyname === "name") {
                    return (typeof keyobj[id + "_" + keyname] === "string");
                } else {
                    const response: InsightResponse = {code: 400, body: {error: "Rooms: Invalid value type."}};
                    throw (response);
                }
            case "courses":
                if (keyname === "dept") {
                    return (typeof keyobj[id + "_" + keyname] === "string");
                } else if (keyname === "id") {
                    return (typeof keyobj[id + "_" + keyname] === "string");
                } else if (keyname === "avg") {
                    return (typeof keyobj[id + "_" + keyname] === "number");
                } else if (keyname === "instructor") {
                    return (typeof keyobj[id + "_" + keyname] === "string");
                } else if (keyname === "title") {
                    return (typeof keyobj[id + "_" + keyname] === "string");
                } else if (keyname === "pass") {
                    return (typeof keyobj[id + "_" + keyname] === "number");
                } else if (keyname === "fail") {
                    return (typeof keyobj[id + "_" + keyname] === "number");
                } else if (keyname === "audit") {
                    return (typeof keyobj[id + "_" + keyname] === "number");
                } else if (keyname === "uuid") {
                    return (typeof keyobj[id + "_" + keyname] === "string");
                } else if (keyname === "year") {
                    return (typeof keyobj[id + "_" + keyname] === "number");
                } else {
                    const response: InsightResponse = {code: 400, body: {error: "Courses: Invalid value type."}};
                    throw (response);
                }
        }
    }
    public convertKeyFunction(keyz: string): any {
        if (keyz === "uuid") {
            keyz = "id";
        } else if (keyz === "instructor") {
            keyz = "Professor";
        } else if (keyz === "title") {
            keyz = "Title";
        } else if (keyz === "dept") {
            keyz = "Subject";
        } else if (keyz === "id") {
            keyz = "Course";
        } else if (keyz === "avg") {
            keyz = "Avg";
        } else if (keyz === "pass") {
            keyz = "Pass";
        } else if (keyz === "fail") {
            keyz = "Fail";
        } else if (keyz === "audit") {
            keyz = "Audit";
        } else if (keyz === "year") {
            keyz = "Year";
        }
        return keyz;
    }

    public convertKeyFunctionReverse (keyz: string): any {
        if (keyz === "id") {
            keyz = "uuid";
        } else if (keyz === "Professor") {
            keyz = "instructor";
        } else if (keyz === "Title") {
            keyz = "title";
        } else if (keyz === "Subject") {
            keyz = "dept";
        } else if (keyz === "Course") {
            keyz = "id";
        } else if (keyz === "Avg") {
            keyz = "avg";
        } else if (keyz === "Pass") {
            keyz = "pass";
        } else if (keyz === "Fail") {
            keyz = "fail";
        } else if (keyz === "Audit") {
            keyz = "audit";
        } else if (keyz === "Year") {
            keyz = "year";
        }
        return keyz;
    }

    public groupFunction(group: any, results: any[]): any {
        if (group.length === 0) {
            return 0;
        }
        const that = this;
        const result: any = {};
        let groupings: any = [];
        let stringGroupigs: any = [];
        const groupingsKeys: any = [];
        // const track: any = {};
        let groupConv: any = [];
        group.forEach(function (gr: any) {
            groupConv.push(gr.split("_")[1]);
        });
        const sectionArrayReturn: any = [];
        results.forEach(function (section: any) {
            const groupMap: any = {};
            const groupMapKey: any = {};
            // create a new group if it does not exist already
            group.forEach(function (gr: any) {
                const keyTemp = gr.split("_")[1];
                const key0 = that.convertKeyFunction(keyTemp);
                const val = that.convertValFunction(key0, section);
                groupMap[gr] = val;
                groupMapKey[val.toString()] = keyTemp;
            });
            // if groupMap already exists in result as a key
            if (stringGroupigs.indexOf(JSON.stringify(groupMap)) >= 0) {
                // add section to the group
                const dd = result[stringGroupigs.indexOf(JSON.stringify(groupMap))]["sections"];
                dd.push(section);
                result[stringGroupigs.indexOf(JSON.stringify(groupMap))] = {};
                result[stringGroupigs.indexOf(JSON.stringify(groupMap))]["sections"] = dd;
                result[stringGroupigs.indexOf(JSON.stringify(groupMap))]["groupKey"] = groupMap;
            } else {
                stringGroupigs.push(JSON.stringify(groupMap));
                const dd: any = [];
                dd.push(section);
                result[stringGroupigs.indexOf(JSON.stringify(groupMap))] = {};
                result[stringGroupigs.indexOf(JSON.stringify(groupMap))]["sections"] = dd;
                result[stringGroupigs.indexOf(JSON.stringify(groupMap))]["groupKey"] = groupMap;
            }
        });
        return result;
    }
    public applyFunction(apply: any, id: string, results: any[]): any {
        // syntax and semantics checksconst that = this;
        const that = this;
        const unique = 0;
        const applyKeys: any = [];
        const appliedValues: any = [];
        let syntax = 1;
        apply.forEach(function (applyObj: object) {
            // "does it contain "_" in the key?
            if (Object.keys(applyObj)[0].includes("_")) {
                syntax = 0;
            }
        });
        if (syntax === 0) {
            return 0;
        }
        apply.forEach(function (applyObj: any) {
            // check syntax
            if (typeof applyObj !== "object") {
                syntax = 0;
            }
            if (Object.keys(applyObj).length !== 1) {
                syntax = 0;
            }
            if (Object.values(applyObj).length !== 1) {
                syntax = 0;
            }
            const applyKey = Object.keys(applyObj)[0];
            applyKeys.push(Object.keys(applyObj)[0]);
            const applyval = Object.values(applyObj[applyKey])[0];
            appliedValues.push(applyval);
        });
        if (syntax === 0) {
            return 0;
        }
        const applyKeysSet = new Set(applyKeys);
        if (!(applyKeys.length === applyKeysSet.size)) { return 0; }
        // get all the sections corresponding to the field
        const computedValues: any = [];
        let check = true;
        apply.forEach(function (applyObj: object) {
            let fieldValues: any = [];
            const appkey = Object.keys(applyObj)[0];
            const keyString = Object.keys(Object.values(applyObj)[0])[0];
            const valString = Object.values(Object.values(applyObj)[0])[0];
            if (valString.split("_")[0] !== id) {
                return 0;
            }
            let field = valString.split("_")[1];
            field = that.convertKeyFunction(field);
            results.forEach(function (section: any) {
                const resultval = that.convertValFunction(field, section);
                fieldValues.push(resultval);
            });
            if (keyString === "MAX" && typeof fieldValues.some((val: any) => typeof val === "number")) {
                // const array1 = [1, 3, 2];
                // const val2 = Math.max(...array1);
                const val = Math.max(...fieldValues);
                const obj: any = {}; obj[appkey] = val;
                computedValues.push(obj);
            } else if (keyString === "MIN" && fieldValues.some((val: any) => typeof val === "number")) {
                const val = Math.min(...fieldValues);
                const obj: any = {}; obj[appkey] = val;
                computedValues.push(obj);
            } else if (keyString === "AVG" && fieldValues.some((val: any) => typeof val === "number")) {
                const decimalVals: any = [];
                fieldValues.forEach(function (fieldval: any) {
                    const deci = new Decimal(fieldval);
                    decimalVals.push(deci);
                });
                const total = decimalVals.reduce((acc: Decimal, curr: Decimal) =>
                    // const accD = new Decimal(acc);
                    // const currD = new Decimal(curr);
                    // accD.toNumber() + currD.toNumber();
                    acc.add(curr));
                const valTemp = total.toNumber() / fieldValues.length;
                const val = Number(valTemp.toFixed(2));
                const obj: any = {}; obj[appkey] = val;
                computedValues.push(obj);
            } else if (keyString === "SUM" && fieldValues.some((val: any) => typeof val === "number")) {
                let val = 0;
                for (const value of fieldValues) {
                    val += value;
                }
                val = Number(val.toFixed(2));
                const obj: any = {}; obj[appkey] = val;
                computedValues.push(obj);
            } else if (keyString === "COUNT") {
                // const val = fieldValues.reduce((acc: number) => acc + 1);
                fieldValues = fieldValues.filter(function (item: any, pos: any) {
                    return fieldValues.indexOf(item) === pos;
                });
                let val = 0;
                for (const value of fieldValues) {
                    val += 1;
                }
                const obj: any = {}; obj[appkey] = val;
                computedValues.push(obj);
            } else {
                check = false; }
        });
        if (!check) { return 0; }
        return computedValues;
    }
    public getAlldata(id: string): any {
        const sectionsArray: any = [];
        const that = this;
        const kind = that.loadedDatasets.get(id)[0];
        const dataset = that.datasets.get(id);
        dataset.forEach(function (chunk: any) {
            if (kind === "courses") {
                chunk["result"].forEach(function (entry: any) {
                    sectionsArray.push(entry);
                });
            } else {
                chunk["rooms"].forEach(function (entry: any) {
                    sectionsArray.push(entry);
                });
            }
        });
        return sectionsArray;
    }

    public eqFunction(object: object, id: string): any {
        if (object === undefined || Object.keys(object).length === 0) {
            return 0;
        }
        const that = this;
        const kind = that.loadedDatasets.get(id)[0];
        // const coursesArray = that.datasets.get(id);
        if (kind === "courses") {
            const coursesArray = that.datasets.get(id);
            const keyString = Object.keys(object)[0];
            let keyz = keyString.split("_")[1];
            if (!(that.ValidKeys(object, kind))) {return 0; }
            keyz = this.convertKeyFunction(keyz);
            const value = Object.values(object)[0];
            if (typeof value !== "number") {
                return 0;
            }
            const sectionArrayToReturn: object[] = [];

            coursesArray.forEach(function (course: any) {
                course["result"].forEach(function (section: any) {
                    let sectionValue = that.convertValFunction(keyz, section);
                    if (sectionValue === value) {
                        sectionArrayToReturn.push(section);
                    }
                });
            });
            return sectionArrayToReturn;
        } else {
            const buildingsArray = that.datasets.get(id);
            const keyString = Object.keys(object)[0];
            if (keyString.split("_")[0] !== id) {
                return 0;
            }
            let keyz = keyString.split("_")[1];
            if (!(that.ValidKeys(object, kind))) {return 0; }
            keyz = this.convertKeyFunction(keyz);
            const value = Object.values(object)[0];
            if (typeof value !== "number") {
                return 0;
            }
            const sectionArrayToReturn: object[] = [];

            // keyz = that.capitalizeFirstLetter(keyz);
            buildingsArray.forEach(function (building: any) {
                building["rooms"].forEach(function (room: any) {
                    let sectionValue = that.convertValFunction(keyz, room);
                    if (sectionValue === value) {
                        sectionArrayToReturn.push(room);
                    }
                });
            });
            return sectionArrayToReturn;
        }
    }

    public ltFunction(object: object, id: string): any {
        if (object === undefined || Object.keys(object).length === 0) {
            return 0;
        }
        const that = this;
        const kind = that.loadedDatasets.get(id)[0];
        if (kind === "courses") {
            const coursesArray = that.datasets.get(id);
            const keyString = Object.keys(object)[0];
            if (keyString.split("_")[0] !== id) {
                return 0;
            }
            let keyz = keyString.split("_")[1];
            if (!(that.ValidKeys(object, kind))) {return 0; }
            keyz = this.convertKeyFunction(keyz);
            const value = Object.values(object)[0];
            if (typeof value !== "number") {
                return 0;
            }
            const sectionArrayToReturn: object[] = [];

            // keyz = that.capitalizeFirstLetter(keyz);
            coursesArray.forEach(function (course: any) {
                course["result"].forEach(function (section: any) {
                    let sectionValue = that.convertValFunction(keyz, section);
                    if (sectionValue < value) {
                        sectionArrayToReturn.push(section);
                    }
                });
            });
            return sectionArrayToReturn;
        } else {
            const buildingsArray = that.datasets.get(id);
            const keyString = Object.keys(object)[0];
            if (keyString.split("_")[0] !== id) {
                return 0;
            }
            let keyz = keyString.split("_")[1];
            if (!(that.ValidKeys(object, kind))) {return 0; }
            keyz = this.convertKeyFunction(keyz);
            const value = Object.values(object)[0];
            if (typeof value !== "number") {
                return 0;
            }
            const sectionArrayToReturn: object[] = [];

            // keyz = that.capitalizeFirstLetter(keyz);
            buildingsArray.forEach(function (building: any) {
                building["rooms"].forEach(function (section: any) {
                    let sectionValue = that.convertValFunction(keyz, section);
                    if (sectionValue < value) {
                        sectionArrayToReturn.push(section);
                    }
                });
            });
            return sectionArrayToReturn;
        }
    }

    public gtFunction(object: object, id: string): any {
        if (object === undefined || Object.keys(object).length === 0) {
            return 0;
        }
        const that = this;
        const kind = that.loadedDatasets.get(id)[0];
        if (kind === "courses") {
            const coursesArray = that.datasets.get(id);
            const keyString = Object.keys(object)[0];
            if (keyString.split("_")[0] !== id) {
                return 0;
            }
            let keyz = keyString.split("_")[1];
            if (!(that.ValidKeys(object, kind))) {return 0; }
            keyz = this.convertKeyFunction(keyz);
            const value = Object.values(object)[0];
            if (typeof value !== "number") {
                return 0;
            }
            const sectionArrayToReturn: object[] = [];

            coursesArray.forEach(function (course: any) {
                course["result"].forEach(function (section: any) {
                    const resultval = that.convertValFunction(keyz, section);
                    if (resultval > value) {
                        sectionArrayToReturn.push(section);
                    }
                });
            });
            return sectionArrayToReturn;
        } else {
            const buildingsArray = that.datasets.get(id);
            const keyString = Object.keys(object)[0];
            if (keyString.split("_")[0] !== id) {
                return 0;
            }
            let keyz = keyString.split("_")[1];
            if (!(that.ValidKeys(object, kind))) {return 0; }
            keyz = this.convertKeyFunction(keyz);
            const value = Object.values(object)[0];
            if (typeof value !== "number") {
                return 0;
            }
            const sectionArrayToReturn: object[] = [];

            // keyz = that.capitalizeFirstLetter(keyz);
            buildingsArray.forEach(function (building: any) {
                building["rooms"].forEach(function (section: any) {
                    const resultval = that.convertValFunction(keyz, section);
                    if (resultval > value) {
                        sectionArrayToReturn.push(section);
                    }
                });
            });
            return sectionArrayToReturn;
        }
    }
    public convertValue(keyz: any, vv: any): any {
        let v = vv;
        if (keyz === "Year") {
            v = parseInt(v, 10);
        } else if (keyz === "id") {
            v = v.toString();
        }
        return v;
    }

    public convertValFunction(keyz: any, section: any): any {
        let val = section[keyz];
        if (keyz === "seats") {
            val = parseInt(section[keyz], 10);
        } else if (keyz === "Year") {
            if (section["Section"] === "overall") {
                val = 1900;
            } else {
                val = parseInt(section[keyz], 10);
            }
        } else if (keyz === "id") {
            val = section[keyz].toString();
        }
        return val;

    }
    public isFunction(object: object, id: string): any {
        if (object === undefined || Object.keys(object).length === 0) {
            return 0;
        }
        const that = this;
        const kind = that.loadedDatasets.get(id)[0];
        const dataset = that.datasets.get(id);
        const keyString = Object.keys(object)[0];
        if (keyString.split("_")[0] !== id) {
            return 0;
        }
        let keyz = keyString.split("_")[1];
        if (!(that.ValidKeys(object, kind))) {return 0; }
        keyz = this.convertKeyFunction(keyz);
        const value = Object.values(object)[0];
        // Log.trace(typeof value);
        if (typeof value !== "string") {
            return 0;
        }
        const sectionArrayToReturn: object[] = [];
        // keyz = that.convertKeyFunction(keyz);
        let temp = false;
        for (let i = 0; i < value.length; i++) {
            if (value[i] === "*" && i !== 0 && i !== value.length - 1) {
                temp = true;
            }
        }
        if (temp === true) {
            return 0;
        }
        // const reg = new RegExp(value); // 'value' is the inputString
        dataset.forEach(function (data: any) {
            if (kind === "courses") {
                data["result"].forEach(function (section: any) {
                    // inputst*ing * ** ***
                    // // if ((/\*/.test(value.substr(1, value.length - 2)) && value.length >= 3) ||
                    //     value === "*" || value === "**") {
                    //     // Log.trace("contains *");
                    //     return 0;
                    // }
                    // * start *
                    if (/^\*/.test(value) && /\*$/.test(value) && !(/\*/.test(value.substr(1, value.length - 2)))) {
                        // const reg1 = RegExp(value);
                        const regvalue1 = new RegExp(value.substr(1, value.length - 2));
                        // Log.trace("evaluating the contains");
                        if (regvalue1.test(section[keyz].toString())) {
                            // Log.trace("matched");
                            sectionArrayToReturn.push(section);
                        }
                    } else if (!/\*/.test(value)) { // no
                        const regvalue2 = new RegExp(value);
                        if (value === section[keyz].toString()) {
                            // Log.trace("matched");
                            sectionArrayToReturn.push(section);
                        }
                    } else if (/\*$/.test(value) && !(/\*/.test(value.substr(0, value.length - 2)))) { // ends*
                        const regvalue3 = new RegExp("^" + value.split("*")[0]);
                        // Log.trace("evaluating the start");
                        // Log.trace(regvalue3.toString());
                        if (regvalue3.test(section[keyz].toString())) {
                            // Log.trace(section[keyz].toString());
                            // Log.trace("started with inputstring, so matched");
                            sectionArrayToReturn.push(section);
                        }
                    } else if (/^\*/.test(value) && !/\*/.test(value.substr(1, value.length - 1))) { // *starts
                        // Log.trace(value.substr(1, value.length - 1));
                        const regvalue4 = new RegExp(value.split("*")[1] + "$");
                        // Log.trace(regvalue4.toString());
                        if (regvalue4.test(section[keyz].toString())) {
                            // Log.trace(section[keyz].toString());
                            // Log.trace("ended with inputstring, so matched");
                            sectionArrayToReturn.push(section);
                        }
                    }
                });
            } else {
                data["rooms"].forEach(function (section: any) {
                    if (/^\*/.test(value) && /\*$/.test(value) && !(/\*/.test(value.substr(1, value.length - 2)))) {
                        // const reg1 = RegExp(value);
                        const regvalue1 = new RegExp(value.substr(1, value.length - 2));
                        // Log.trace("evaluating the contains");
                        if (regvalue1.test(section[keyz].toString())) {
                            // Log.trace("matched");
                            sectionArrayToReturn.push(section);
                        }
                    } else if (!/\*/.test(value)) { // no
                        const regvalue2 = new RegExp(value);
                        if (value === section[keyz].toString()) {
                            // Log.trace("matched");
                            sectionArrayToReturn.push(section);
                        }
                    } else if (/\*$/.test(value) && !(/\*/.test(value.substr(0, value.length - 2)))) { // ends*
                        const regvalue3 = new RegExp("^" + value.split("*")[0]);
                        // Log.trace("evaluating the start");
                        // Log.trace(regvalue3.toString());
                        if (regvalue3.test(section[keyz].toString())) {
                            // Log.trace(section[keyz].toString());
                            // Log.trace("started with inputstring, so matched");
                            sectionArrayToReturn.push(section);
                        }
                    } else if (/^\*/.test(value) && !/\*/.test(value.substr(1, value.length - 1))) { // *starts
                        // Log.trace(value.substr(1, value.length - 1));
                        const regvalue4 = new RegExp(value.split("*")[1] + "$");
                        // Log.trace(regvalue4.toString());
                        if (regvalue4.test(section[keyz].toString())) {
                            // Log.trace(section[keyz].toString());
                            // Log.trace("ended with inputstring, so matched");
                            sectionArrayToReturn.push(section);
                        }
                    }
                });
            }
        });
        return sectionArrayToReturn;
    }

    public notFunction(object: object, id: string): any {
        if (object === undefined || Object.keys(object).length === 0) {
            return 0;
        }
        const that = this;
        const kind = that.loadedDatasets.get(id)[0];
        const dataArray = that.datasets.get(id);
        // const allUuidList: any = [];
        const logic = Object.keys(object)[0];
        let sectionArrayToReturn: any = [];
        const uuidList: any = [];
        const uuidListOfCourses: any = [];
        let realArrayToReturn: any = [];
        const sections: any = [];

        dataArray.forEach(function (data: any) {
            if (kind === "courses") {
                data["result"].forEach(function (section: any) {
                    uuidListOfCourses.push(section["id"]);
                    sections.push(section);
                });
            } else {
                data["rooms"].forEach(function (section: any) {
                    uuidListOfCourses.push(section["href"]);
                    sections.push(section);
                });
            }
        });

        const objkey = Object.keys(object)[0];
        const objval = Object.values(object)[0];
        if (logic === "EQ" && that.ValidKeys(objval, kind) &&
            typeof Object.values(objval)[0] === "number") {
            sectionArrayToReturn = that.eqFunction(Object.values(object)[0], id);
        } else if (logic === "IS" && that.ValidKeys(objval, kind) &&
            typeof Object.values(objval)[0] === "string") {
            sectionArrayToReturn = that.isFunction(Object.values(object)[0], id);
        } else if (logic === "OR") {
            sectionArrayToReturn = that.orFunction(Object.values(object)[0], id);
        } else if (logic === "AND") {
            sectionArrayToReturn = that.andFunction(Object.values(object)[0], id);
        } else if (logic === "LT" && that.ValidKeys(objval, kind) &&
            typeof Object.values(objval)[0] === "number") {
            sectionArrayToReturn = that.ltFunction(Object.values(object)[0], id);
        } else if (logic === "GT" && that.ValidKeys(objval, kind) &&
            typeof Object.values(objval)[0] === "number") {
            sectionArrayToReturn = that.gtFunction(Object.values(object)[0], id);
        } else if (logic === "NOT") {
            sectionArrayToReturn = that.notFunction(Object.values(object)[0], id);
        } else {return 0; }
        if (sectionArrayToReturn === 0) {
            return 0;
        }
        if (sectionArrayToReturn.length === that.loadedDatasets.get(id)[1]) {
            return [];
        } else if (sectionArrayToReturn.length === 0) {
            return sections;
        }
        realArrayToReturn = sections.filter(function (x: any) { return sectionArrayToReturn.indexOf(x) < 0; });
        return realArrayToReturn;
    }

    public orFunction(objectArray: any, id: string): any {
        const that = this;
        const kind = that.loadedDatasets.get(id)[0];
        const sectionArrayToReturn: object[] = [];
        const realArrayToReturn: any = [];
        const uuidList: object[] = [];
        const filteredUuidList: any = [];
        let trueIfError = false;
        if (objectArray.length <= 0) {
            return 0;
        }
        objectArray.forEach(function (logic: any): any {
            let temp = [];
            const objkey = Object.keys(logic)[0];
            const objval = Object.values(logic)[0];
            if (Object.keys(logic)[0] === "EQ" && that.ValidKeys(objval, kind) &&
                typeof Object.values(objval)[0] === "number") {
                temp = that.eqFunction(Object.values(logic)[0], id);
            } else if (Object.keys(logic)[0] === "IS" && that.ValidKeys(objval, kind) &&
                typeof Object.values(objval)[0] === "string") {
                temp = that.isFunction(Object.values(logic)[0], id);
            } else if (Object.keys(logic)[0] === "OR") {
                temp = that.orFunction(Object.values(logic)[0], id);
            } else if (Object.keys(logic)[0] === "AND") {
                temp = that.andFunction(Object.values(logic)[0], id);
            } else if (Object.keys(logic)[0] === "LT" && that.ValidKeys(objval, kind) &&
                typeof Object.values(objval)[0] === "number") {
                temp = that.ltFunction(Object.values(logic)[0], id);
            } else if (Object.keys(logic)[0] === "GT" && that.ValidKeys(objval, kind) &&
                typeof Object.values(objval)[0] === "number") {
                temp = that.gtFunction(Object.values(logic)[0], id);
            } else if (Object.keys(logic)[0] === "NOT") {
                temp = that.notFunction(Object.values(logic)[0], id);
            } else {trueIfError = true; }

            if (temp === 0) {
                trueIfError = true;
            }
            sectionArrayToReturn.push(temp);
        });

        if (trueIfError) {
            return 0;
        }

        function union(arr1: any, arr2: any) {
            return (arr1.concat(arr2));
        }
        let count = 1;
        let i = 1;
        let unionArrayCurr: any = [];
        let unionArrayPrev = sectionArrayToReturn[0];
        if (objectArray.length === 1 ) { return unionArrayPrev; }
        while (count < objectArray.length && objectArray.length > 1) {
            unionArrayCurr = union(unionArrayPrev, sectionArrayToReturn[i]);
            unionArrayCurr = unionArrayCurr.filter(function (item: any, pos: any) {
                return unionArrayCurr.indexOf(item) === pos;
            });
            unionArrayPrev = unionArrayCurr;
            i++; count++;
        }
        return unionArrayCurr;
    }

    public andFunction(objectArray: any, id: string): any {
        const that = this;
        const kind = that.loadedDatasets.get(id)[0];
        const sectionArrayToReturn: object[] = [];
        let trueIfError = false;
        let realArrayToReturn: any = [];
        if (objectArray.length <= 0) {
            return 0;
        }
        objectArray.forEach(function (logic: any): any {
            let temp = [];
            const objkey = Object.keys(logic)[0];
            const objval = Object.values(logic)[0];
            if (Object.keys(logic)[0] === "EQ" && that.ValidKeys(objval, kind) &&
                typeof Object.values(objval)[0] === "number") {
                temp = that.eqFunction(Object.values(logic)[0], id);
            } else if (Object.keys(logic)[0] === "IS" && that.ValidKeys(objval, kind) &&
                typeof Object.values(objval)[0] === "string") {
                temp = that.isFunction(Object.values(logic)[0], id);
            } else if (Object.keys(logic)[0] === "OR") {
                temp = that.orFunction(Object.values(logic)[0], id);
            } else if (Object.keys(logic)[0] === "AND") {
                temp = that.andFunction(Object.values(logic)[0], id);
            } else if (Object.keys(logic)[0] === "LT" && that.ValidKeys(objval, kind) &&
                typeof Object.values(objval)[0] === "number") {
                temp = that.ltFunction(Object.values(logic)[0], id);
            } else if (Object.keys(logic)[0] === "GT" && that.ValidKeys(objval, kind) &&
                typeof Object.values(objval)[0] === "number") {
                temp = that.gtFunction(Object.values(logic)[0], id);
            } else if (Object.keys(logic)[0] === "NOT") {
                temp = that.notFunction(Object.values(logic)[0], id);
            } else {trueIfError = true; }
            if (temp === 0) {
                trueIfError = true;
            }
            sectionArrayToReturn.push(temp);
        });
        if (trueIfError) {
            return 0;
        }
        // this code is from https://stackoverflow.com/questions/16227197/
        // compute-intersection-of-two-arrays-in-javascript/16227294#16227294
        function intersect(arr1: any, arr2: any) {
            let t;
            if (arr2.length > arr1.length) {t = arr2; arr2 = arr1; arr1 = t; } // indexOf to loop over shorter
            return arr1.filter(function (e: any) {
                return arr2.indexOf(e) > -1;
            }).filter(function (item: any, pos: any, arr: any) { // extra step to remove duplicates
                return arr.indexOf(item) === pos;
            });
        }

        let count = 1;
        let i = 1;
        let intersectArrayPrev = sectionArrayToReturn[0];
        let intersectArrayCurr: any = [];
        if (objectArray.length === 1) {return intersectArrayPrev; }
        while (count < objectArray.length && objectArray.length > 1) {
            intersectArrayCurr = intersect(intersectArrayPrev, sectionArrayToReturn[i]);
            intersectArrayPrev = intersectArrayCurr;
            i++; count++;
        }
        return intersectArrayCurr;
    }

    public listDatasets(): Promise<InsightResponse> {
        const that = this;
        return new Promise<InsightResponse>(function (resolve, reject) {
            const response: InsightResponse = {code: 200, body: {result: that.insightDatasets}};
            resolve(response);
        });
    }
}
