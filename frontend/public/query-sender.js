/**
 * Receives a query object as parameter and sends it as Ajax request to the POST /query REST endpoint.
 *
 * @param query The query object
 * @returns {Promise} Promise that must be fulfilled if the Ajax request is successful and be rejected otherwise.
 */
CampusExplorer.sendQuery = function(query) {
    return new Promise(function(fulfill, reject) {
        try {
            let xhr = new XMLHttpRequest();
            xhr.open("POST", "/query", true);
            xhr.send(JSON.stringify(query));
            xhr.onload = function () {
                // Request finished. Do processing here
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        // successful; do something here
                        fulfill(JSON.parse(xhr.response));
                    } else {
                        //error 403/404/500
                        console.log("Error Present: Error "+xhr.status);
                        reject(JSON.parse(xhr.response));
                    }
                }
            };
        }catch (err) {
            let temp = {};
            console.log("Error Present: query-sender promise not fulfilled");
            temp["error"]= "ERROR; query-sender promise not fulfilled";
            reject(temp);
        }
    });
};
