import Server from "../src/rest/Server";

import InsightFacade from "../src/controller/InsightFacade";
import chai = require("chai");
import { expect } from "chai";
import Log from "../src/Util";
import chaiHttp = require("chai-http");
import TestUtil from "./TestUtil";
import * as Util from "util";
describe("Facade D3", function () {

    let facade: InsightFacade = null;
    let server: Server = null;

    chai.use(chaiHttp);

    before(function () {
        facade = new InsightFacade();
        server = new Server(4321);
        // TODO: start server here once and handle errors properly
        server.start();
    });

    after(function () {
        // TODO: stop server here once!
        server.stop();
    });

    beforeEach(function () {
        // might want to add some process logging here to keep track of what"s going on

    });

    afterEach(function () {
        // might want to add some process logging here to keep track of what"s going on
    });

    // TODO: read your courses and rooms datasets here once!
    const fs = require("fs");
    const rooms = fs.readFileSync("./test/data/rooms.zip");
    const courses = fs.readFileSync("./test/data/courses.zip");
    // Hint on how to test PUT requests
    it("PUT test for courses dataset", function () {
        try {
            return chai.request("http://localhost:4321")
                .put("/dataset/courses/courses")
                .attach("body", courses, "courses.zip")
                .then(function (res: ChaiHttp.Response) {
                    // some logging here please!
                    expect(res.status).to.be.equal(204);
                })
                .catch(function (err: any) {
                    // some logging here please!
                    Log.trace(err);
                    expect.fail();
                });
        } catch (err) {
            // and some more logging here!
            Log.trace("ERROR" + err);
        }
    });
    it("PUT test for ROOMS dataset", function () {
        try {
            return chai.request("http://localhost:4321")
                .put("/dataset/rooms/rooms")
                .attach("body", rooms, "rooms.zip")
                .then(function (res: ChaiHttp.Response) {
                    // some logging here please!
                    expect(res.status).to.be.equal(204);
                })
                .catch(function (err: any) {
                    // some logging here please!
                    Log.trace(err);
                    expect.fail();
                });
        } catch (err) {
            // and some more logging here!
            Log.trace("ERROR" + err);
        }
    });
    // The other endpoints work similarly. You should be able to find all instructions at the chai-http documentation
    it("POST test for ROOMS dataset", function () {
        try {
            const queryStr = fs.readFileSync("./test/queries/d2_rooms.json");
            const queryJson = JSON.parse(queryStr);
            return chai.request("http://localhost:4321")
                .post("/query")
                .send(queryJson.query)
                .then(function (res: ChaiHttp.Response) {
                    // some logging here please!
                    expect(res.status).to.be.equal(200);
                })
                .catch(function (err: any) {
                    // some logging here please!
                    Log.trace(err);
                    expect.fail();
                });
        } catch (err) {
            // and some more logging here!
        }
    });
    // before all hook failed?
    // it("POST test for COURSES dataset", function () {
    //     try {
    //         const queryStr = fs.readFileSync("../test/queries/d2_trans2.json");
    //         const queryJson = JSON.parse(queryStr);
    //         return chai.request("http://localhost:4321")
    //             .post("/query")
    //             .send(queryJson)
    //             .then(function (res: ChaiHttp.Response) {
    //                 // some logging here please!
    //                 expect(res.status).to.be.equal(200);
    //             })
    //             .catch(function (err: any) {
    //                 // some logging here please!
    //                 Log.trace(err);
    //                 expect.fail();
    //             });
    //     } catch (err) {
    //         // and some more logging here!
    //     }
    // });
    it("GET test for courses dataset", function () {
        try {
            return chai.request("http://localhost:4321")
                .get("/datasets")
                .then(function (res: ChaiHttp.Response) {
                    // some logging here please!
                    expect(res.status).to.be.equal(200);
                })
                .catch(function (err: any) {
                    // some logging here please!
                    Log.trace(err);
                    expect.fail();
                });
        } catch (err) {
            // and some more logging here!
        }
    });
    it("DELETE test for courses dataset", function () {
        try {
            return chai.request("http://localhost:4321")
                .del("/dataset/courses")
                .then(function (res: ChaiHttp.Response) {
                    // some logging here please!
                    expect(res.status).to.be.equal(204);
                })
                .catch(function (err: any) {
                    // some logging here please!
                    Log.trace(err);
                    expect.fail();
                });
        } catch (err) {
            // and some more logging here!
        }
    });
    it("GET test for courses dataset", function () {
        try {
            return chai.request("http://localhost:4321")
                .get("/datasets")
                .then(function (res: ChaiHttp.Response) {
                    // some logging here please!
                    expect(res.status).to.be.equal(200);
                })
                .catch(function (err: any) {
                    // some logging here please!
                    Log.trace(err);
                    expect.fail();
                });
        } catch (err) {
            // and some more logging here!
        }
    });
    it("DELETE test for courses dataset", function () {
        try {
            return chai.request("http://localhost:4321")
                .del("/dataset/courses")
                .then(function (res: ChaiHttp.Response) {
                    // some logging here please!
                    Log.trace("DELETE THEN" + JSON.stringify(res.status));
                    expect(res.status).to.be.equal(204);
                })
                .catch(function (err: any) {
                    // some logging here please!
                    Log.trace(err);
                    expect(err.status).to.be.equal(404);
                });
        } catch (err) {
            // and some more logging here!
            Log.trace(err.toString());
            expect.fail();
        }
    });
    it("PUT test for courses dataset", function () {
        try {
            return chai.request("http://localhost:4321")
                .put("/dataset/dd/courses")
                .attach("body", courses, "courses.zip")
                .then(function (res: ChaiHttp.Response) {
                    // some logging here please!
                    expect(res.status).to.be.equal(204);
                })
                .catch(function (err: any) {
                    // some logging here please!
                    Log.trace(err);
                    expect(err.status).to.be.equal(400);
                });
        } catch (err) {
            // and some more logging here!
            Log.trace("ERROR" + err);
            expect.fail();
        }
    });
    it("POST test for apply error", function () {
        try {
            const queryStr2 = fs.readFileSync("./test/queries/w16.json");
            const queryJson2 = JSON.parse(queryStr2);
            return chai.request("http://localhost:4321")
                .post("/query")
                .send(queryJson2)
                .then(function (res: ChaiHttp.Response) {
                    // some logging here please!
                    expect(res.status).to.be.equal(200);
                })
                .catch(function (err: ChaiHttp.Response) {
                    // some logging here please!
                    Log.trace(JSON.stringify(err));
                    Log.trace("ERROR:: " + JSON.stringify(err.text));
                    expect(err.status).to.be.equal(400);
                });
        } catch (err) {
            // and some more logging here!
            Log.trace("ERROR" + err);
            expect.fail();
        }
    });
});
