/**
 * Builds a query object using the current document object model (DOM).
 * Must use the browser's global document object {@link https://developer.mozilla.org/en-US/docs/Web/API/Document}
 * to read DOM information.
 *
 * @returns query object adhering to the query EBNF
 */
CampusExplorer.buildQuery = function() {
    // builds queries from the current state of the UI.
    // Information from the UI must be extracted using the browser-native global document object.
    // The returned queries must be of the same format as the ones given to your InsightFacade.performQuery method.
    // ie) {WHERE: ....}
    let query = {};
    // TODO: implement!

    let subDocument = document.getElementsByClassName("tab-panel active")[0];

    // check if plain/courses/rooms tab
    let allAnyNone = 1; // 1=all 2=any 3=none

        let tabType = "courses";
        if (subDocument.id === "tab-rooms") {
            tabType = "rooms";
        }

        ///////////////////////////////////////// WHERE //////////////////////////////////////////////////////

        // check all/any/none checkboxes
        let all = subDocument.childNodes[0]; //...[1] for our local server
        let all2 = all[0].attributes.length;
        if (all2 !== 5) {
            let any = subDocument.childNodes[0];
            let any2 = any[1].attributes.length;
            if (any2 !== 5) {
                allAnyNone = 3;
            } else {
                allAnyNone = 2;
            }
        }

        let conditionContainer = subDocument.getElementsByClassName("conditions-container")[0];
        let conditions = []; // list of objects. ie) [{"IS": "courses_dept"="cpsc"}, {EQ...}]
        let numConditions = conditionContainer.childNodes.length;
        let obj = {};

        if (numConditions > 1) { // there's more than one condition
            if (allAnyNone===1){
                for (let i = 0; i<numConditions; i++) {
                    conditions.push(conditionObj(conditionContainer.childNodes[i], tabType));
                }
                obj["AND"]=conditions;    // obj = {"AND": [{...}, {...}]}
            } else if (allAnyNone===2) {
                for (let i = 0; i<numConditions; i++) {
                    conditions.push(conditionObj(conditionContainer.childNodes[i], tabType));
                }
                obj["OR"]=conditions;    // obj = {"OR": [{...}, {...}]}
            } else if (allAnyNone === 3) {
                let notObj = {};
                for (let i = 0; i<numConditions; i++) {
                    conditions.push(conditionObj(conditionContainer.childNodes[i], tabType));
                }
                notObj["OR"]=conditions;    // notObj = {"OR": [{...}, {...}]}
                obj["NOT"]= notObj; // obj = {"NOT": {"OR":[{...},{...}]}}
            }
            query["WHERE"] = obj;
        } else if (numConditions === 1) { // there's only one condition
            if (allAnyNone===3) { // none of the following
                let tempObj = {};
                tempObj["NOT"] = conditionObj(conditionContainer.childNodes[0], tabType);
                query["WHERE"]=tempObj;
            }else {
                query["WHERE"] = conditionObj(conditionContainer.childNodes[0], tabType);
            }
        } else {query["WHERE"] = obj;} // if no condition present, "WHERE": { }

        ////////////////////////////////////////////// COLUMN ///////////////////////////////////////////////////

        let optionObj = {};
        let columnGroups = subDocument.getElementsByClassName("form-group columns")[0];
        let columns = [];
        let temp = columnGroups.childNodes[3];
        for (let i = 1; i<temp.childNodes.length; i+=2) {
            let columnField = temp.childNodes[i];
            if (columnField.childNodes[1].attributes.length === 5) {    // case with no transformation
                if (subDocument.id === "tab-courses") {
                    columns.push("courses_"+columnField.childNodes[1].attributes[3].value);
                }else {
                    columns.push("rooms_"+columnField.childNodes[1].attributes[3].value);
                }
            } else if (columnField.childNodes[1].attributes.length === 4 && columnField.attributes[0].value === "control transformation"){// case with transformation
                columns.push(columnField.childNodes[1].attributes[2].value);
            }
        }
        if (columns.length !== 0) {
            optionObj["COLUMNS"] = columns;
        }


        /////////////////////////////////////////////// ORDER /////////////////////////////////////////////////////

        let orderGroups = subDocument.getElementsByClassName("form-group order")[0];
        let order = "";
        let keyArray = [];
        let orderFields = orderGroups.childNodes[3].childNodes[1].childNodes[1];
        for (let i = 0; i<orderFields.options.length; i++) {
            if (orderFields.options[i].attributes.length===2 && orderFields.options[i].attributes[0].value !== "transformation"){  // reg order ie) no transformation-related order
                if (subDocument.id === "tab-courses"){
                    order = "courses_" + orderFields.options[i].attributes[0].value;
                    keyArray.push(order);
                    // break;
                }else {
                    order = "rooms_" + orderFields.options[i].attributes[0].value;
                    keyArray.push(order);
                }

            } else if (orderFields.options[i].attributes.length === 3 && orderFields.options[i].attributes[0].value === "transformation") {
                order = orderFields.options[i].attributes[1].value;
                keyArray.push(order);
                // break;
            }
        }
        let orderObj = {};
        if (order !== "") {
            let orderDescending = orderGroups.childNodes[3].childNodes[3].childNodes[1];
            if (orderDescending.attributes.length===3) { // descending is checked
                orderObj["dir"]="DOWN";
                // keyArray.push(order);
                orderObj["keys"]=keyArray;
                optionObj["ORDER"] = orderObj;
            } else {                                    // descending not checked
                orderObj["dir"]="UP";
                // keyArray.push(order);
                orderObj["keys"]=keyArray;
                optionObj["ORDER"] = orderObj;
            }
        }

        if (Object.keys(optionObj).length !== 0){
            query["OPTIONS"]=optionObj;
        }

        ///////////////////////////////////  TRANSFORMATIONS  ////////////////////////////////////////////////////////

        let transformationObj = {}; // transformation obj must have a group&apply obj
        let groups = [];
        let apply = [];

        let groupGroups = subDocument.getElementsByClassName("form-group groups")[0].childNodes[3]; // div.control-group
        for (let i = 1; i<groupGroups.childNodes.length; i+=2) {
            let groupField = groupGroups.childNodes[i];
            if (groupField.childNodes[1].attributes.length === 5) {
                if (subDocument.id === "tab-courses") {
                    groups.push("courses_"+groupField.childNodes[1].attributes[3].value);
                }else {
                    groups.push("rooms_"+groupField.childNodes[1].attributes[3].value);
                }

            }
        }

        let transfGroups = subDocument.getElementsByClassName("form-group transformations")[0];
        let transfContainer = transfGroups.childNodes[3];
        let numTransf = transfContainer.childNodes.length;
        if (numTransf >=1) {
            for (let i = 0; i<numTransf; i++) {
                //let t = transformationHelper(transfContainer.childNodes[i]);
                //if (t !== 0) {
                    apply.push(transformationHelper(transfContainer.childNodes[i]));
                //}
            }
        }

        if (groups.length !== 0){
            transformationObj["GROUP"] = groups;
            query["TRANSFORMATIONS"] = transformationObj;
            transformationObj["APPLY"] = apply;
            query["TRANSFORMATIONS"] = transformationObj;
        } else if (apply.length !== 0){
            transformationObj["APPLY"] = apply;
            query["TRANSFORMATIONS"] = transformationObj;
        }
    return query;
};






//helper function for TRANSFORMATION
function transformationHelper(transformation) {
    let term = ""; //ie) test, apple, (what we name). Can be empty
    let operator = ""; // ie) MAX, AVG, etc
    let field = ""; // ie) "dept", "uuid", "test", etc
    let returnObj = {};
    let subObj = {};

    let controlFields = transformation.childNodes[5].childNodes[1]; // have 10+n options
    let temp = controlFields.options.length;
    for (let i = 0; i<temp; i++) {
        if (controlFields.options[i].attributes.length === 2) {
            field = controlFields.options[i].attributes[0].value;
            break;
        }
    }
    let controlOperators = transformation.childNodes[3].childNodes[1]; // 5 options
    for (let i = 0; i<5; i++) {
        if (controlOperators.options[i].attributes.length === 2) {
            operator = controlOperators.options[i].attributes[0].value;
            break;
        }
    }
    let controlTerm = transformation.childNodes[1].childNodes[1];
    if (controlTerm.attributes.length===2) {
        term = controlTerm.attributes[1].value;
    }
    // if (term===""){
    //     return 0;
    // }

    if (field === "fail" || field === "audit" || field === "dept" || field === "avg" || field === "id" || field === "uuid" || field === "instructor" ||
        field === "title" || field === "pass") {
        field = "courses_"+field;
    }
    if (field === "fullname" || field === "shortname" || field === "number" || field === "name" || field === "address" ||
        field === "lat" || field === "lon" || field === "seats" || field === "type" || field === "furniture" || field === "href"){
        field = "rooms_"+field;
    }

    subObj[operator] = field;
    returnObj[term] = subObj;
    return returnObj;
}






// helper function for WHERE
// returns an object for each condition. ie) {"NOT": {"IS" : "courses_dept" = "cpsc"}}
function conditionObj(condition, tabType) {
    let not = 0; // 0=not checked 1=checked
    let field = ""; // ie) "dept", "uuid", etc
    let operator = ""; // ie) "IS", "EQ", etc
    let term = ""; // ie) 97, "cpsc", "12345", etc
    if (condition.childNodes[1].childNodes[1].attributes.length !== 1) {
        not=1;
    }
    let controlFields = condition.childNodes[3].childNodes[1]; // have 10 options
    for (let i = 0; i<controlFields.options.length; i++) {
        if (controlFields.options[i].attributes.length === 2) {
            field = controlFields.options[i].attributes[0].value;
            break;
        }
    }
    let controlOperators = condition.childNodes[5].childNodes[1]; // 4 options
    for (let i = 0; i<4; i++) {
        if (controlOperators.options[i].attributes.length === 2) {
            operator = controlOperators.options[i].attributes[0].value;
            break;
        }
    }
    let controlTerm = condition.childNodes[7].childNodes[1];
    if (controlTerm.attributes.length===2) {
        term = controlTerm.attributes[1].value;
    }
    if (field === "avg" || field === "pass" || field === "fail" || field === "audit" ||
        field === "lat" || field === "lon" || field === "seats" || field === "year" || field === "number") {
        term = Number(term);
    }
    let obj = {};
    if (not === 0) {
        let tempObj = {};
        if (tabType === "courses") {
            tempObj["courses_"+field] = term;
        }else {
            tempObj["rooms_"+field] = term;
        }
        obj[operator] = tempObj;
        return obj;
    } else {
        let tempObj = {};
        if (tabType === "courses") {
            tempObj["courses_"+field] = term;
        }else {
            tempObj["rooms_"+field] = term;
        }
        let tempObj2 = {};
        tempObj2[operator] = tempObj;
        obj["NOT"] = tempObj2;
        return obj;
    }
}
