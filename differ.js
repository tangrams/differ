// "use strict";
/*jslint browser: true*/
/*global Tangram, gui */




//
// initialize variables
//

var map, slots = {}, queue, nextView,
    diffImg = new Image(), diff, canvas, ctx,
    images = {};
var testsFile = "";
var queryFile = "";
var imgType = ".png";
var size = 250; // physical pixels
var lsize = size * window.devicePixelRatio; // logical pixels
var numTests, scores = [], totalScore = 0;
var allTestsDiv = document.getElementById("tests");
var statusDiv = document.getElementById("statustext");
var progressBar = document.getElementById("progressbar");
var alertDiv = document.getElementById("alert");
var totalScoreDiv = document.getElementById("totalScore");
var goButton = document.getElementById("goButton");
var stopButton = document.getElementById("stopButton");
var saveButton = document.getElementById("saveButton");
var slot1 = document.getElementById("slot1");
var slot2 = document.getElementById("slot2");
var data, metadata;
var loadTime = Date();
var writeScreenshots = false; // write new map images to disk?
var defaultFile = "tests/default1.json";

// new:
var frame1 = {
    'iframe': document.getElementById("map1"),
    'window': document.getElementById("map1").contentWindow,
    'document': document.getElementById("map1").contentDocument
}
var frame2 = {
    'iframe': document.getElementById("map2"),
    'window': document.getElementById("map2").contentWindow,
    'document': document.getElementById("map2").contentDocument
}

// can only use saveButton if running on a local node server
if (window.location.hostname != "localhost" ) saveButton.setAttribute("style", "display:none");


//
// helper functions
//

// useragent.innerHTML = "useragent: "+navigator.userAgent+"<br>Device pixel ratio: "+window.devicePixelRatio;

// parse URL to check for test json passed in the query
// eg: http://localhost:8080/?test.json
// http://stackoverflow.com/questions/2090551/parse-query-string-in-javascript
function getQueryVariable(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) == variable) {
            return decodeURIComponent(pair[1]);
        }
    }
    return "";
}

function isPathAbsolute(path) {
  return /^(?:\/|[a-z]+:\/\/)/.test(path);
}

function parseQuery() {
    var url = getQueryVariable("1")
    if (url != "") {
        slot1.value = url;
    }
    url = getQueryVariable("2")
    if (url != "") {
        slot2.value = url;
    }
    url = getQueryVariable("go")
    if (url != "") {
        goButton.click();
    }
}

// add text to the output div
function diffAdd(txt) {
    setTimeout(function() {
        alertDiv.innerHTML += txt;
        alertDiv.scrollTop = alertDiv.scrollHeight;
    }, 50);
}
function diffSay(txt) {
    diffAdd(txt+"<br>")
}

// convert github links to raw github files
function convertGithub(url) {
    var a = document.createElement('a');
    a.href = url;
    queryFile = url;
    if (a.hostname == "github.com") {
        a.hostname = "raw.githubusercontent.com";
        a.pathname = a.pathname.replace("/blob", "");
    }
    return a.href;
}

// handle enter key in filename input
function catchEnter(e){
    if (!e) e = window.event;
    var keyCode = e.keyCode || e.which;
    if (keyCode == '13') { // Enter pressed
        goButton.click();
        return false;
    }
}

// split a URL string into pieces
function splitURL(url) {
    if (typeof url == 'undefined') return 'undefined';
    var dir = url.substring(0, url.lastIndexOf('/')) + "/";
    var file = url.substring(url.lastIndexOf('/')+1, url.length);
    var ext = url.substring(url.lastIndexOf('.')+1, url.length);
    return {"dir" : dir, "file": file, "ext": ext};
}

function parseURL(url) {
    var parser = document.createElement('a');
    parser.href = url;
    console.log('parser:', parser);
    return parser;
}
// load a file from a URL
function readTextFile(file, callback) {
    var filename = splitURL(file).file;
    var rawFile = new XMLHttpRequest();
    rawFile.overrideMimeType("application/json");
    try {
        rawFile.open("GET", file, true);
    } catch (e) {
        console.error("Error opening file:", e);
    }
    rawFile.onreadystatechange = function() {
        // readyState 4 = done
        if (rawFile.readyState === 4 && rawFile.status == "200") {
            callback(rawFile.responseText);
        }
        else if (rawFile.readyState === 4 && rawFile.status == "404") {
            console.error("404 – can't load file", file);
            diffSay("404 - can't load file <a href='"+file+"'>"+filename+"</a>");
        } else if (rawFile.readyState === 4) {
            diffSay("Had trouble loading that file.");
            if (parseURL.host == "github.com") {
                diffSay("I notice you're trying to load a file from github, make sure you're using the \"raw\" file!");
            }
        }

    }
    rawFile.send(null);
}

function updateURL() {
    var parser = document.createElement('a');
    parser.href = window.location;
    var url = parser.pathname+"?1="+escape(slot1.value)+"&2="+escape(slot2.value);
    if (parser.origin+url+"&go" != window.location) {
        var currentstate = history.state;
        window.history.pushState(currentstate, "", url);
    }
}

// get link for blob
function linkFromBlob(blob) {
    var urlCreator = window.URL || window.webkitURL;
    return urlCreator.createObjectURL( blob );
}

// update progress bar, remaining = number of tests left to do
function updateProgress(remaining) {
    var percent = 100 - (remaining / numTests) * 100;
    progressBar.setAttribute("style", "width:"+percent + "%");
}


//
// prep scene
//

// todo: prep map in two iframes - pass each iframe's contentDocument as the document
// another issue: lots of this code assumes a single global 'map' var
// todo: make sure each 'map' is referring to a specific iframe's 'map' each time
// and determine which one it should be at every point

function newPrepMap(which) {
    return new Promise(function(resolve, reject) {
        // debugger;
        var frame = which.iframe;
        var mapWindow = which.window;
        frame.style.height = size+"px";
        frame.style.width = size+"px";

        // not sure why the others hit a race condition but this doesn't ಠ_ಠ
        frame.contentDocument.getElementById("map").style.height = size+"px";
        frame.contentDocument.getElementById("map").style.width = size+"px";
        // which['document'].getElementById("map").style.height = size+"px";
        // which['document'].getElementById("map").style.width = size+"px";
        // which.document.getElementById("map").style.height = size+"px";
        // which.document.getElementById("map").style.width = size+"px";

        // initialize Tangram
        // todo: maybe no longer necessary - replace this with a promise
        // which resolves with each iframe's onload()
        /*** Map ***/
        // new:
        if (typeof mapWindow.map == "undefined") {

            mapWindow.map = L.map('mapdiv', {
                keyboardZoomOffset : 1.,
                zoomControl: false,
                attributionControl : false
            });
            mapWindow.map.setView([0,0],5);

            var layer = Tangram.leafletLayer({
                scene: null,
                // highDensityDisplay: false
            });

            mapWindow.layer = layer;
            mapWindow.scene = layer.scene;

            layer.on('init', function () {
                resolve(mapWindow.map);
            });

            layer.addTo(mapWindow.map);

        } else{
            resolve(mapWindow.map);
        }
    }); 
}

function prepMap() {
    return new Promise(function(resolve, reject) {
        // set sizes
        // old:
        document.getElementById("mapdiv").style.height = size+"px";
        document.getElementById("mapdiv").style.width = size+"px";

        // initialize Tangram
        // todo: this is probably no longer necessary - replace this with a promise
        // which resolves with each iframe's onload()
        /*** Map ***/
        // old:
        if (typeof window.map == "undefined") {

            var map = L.map('mapdiv', {
                keyboardZoomOffset : .05,
                zoomControl: false,
                attributionControl : false
            });
            map.setView([0,0],5);

            var layer = Tangram.leafletLayer({
                scene: null,
                // highDensityDisplay: false
            });

            window.layer = layer;
            var scene = layer.scene;
            window.scene = scene;

            layer.on('init', function () {
                resolve(map);
            });

            layer.addTo(map);

        } else{
            resolve(window.map);
        }

    });
}

// ensure iFrames are loaded before we start manipulating them
// todo: make this less fugly
// function to report when iframes have loaded
var frame1Resolve, frame2Resolve;
var frame1Ready = new Promise(function(resolve, reject) {
        console.log('frame1 loaded');
        frame1Resolve = resolve;
    });
var frame2Ready = new Promise(function(resolve, reject) {
        console.log('frame2 loaded');
        frame2Resolve = resolve;
    });

// parse url and load the appropriate file
function loadFile(url) {
    return new Promise(function(resolve, reject) {
        var local = false;
        if (url == "") {
            throw new Error("Empty slot");
            reject();
        }
        if (url == "Local renders") {
            local = true;
            if (slot2.value == "Local renders") url = slot1.value;
            else url = slot2.value;
        }
        // diffSay("Loading "+url);
        url = convertGithub(url);
        var urlname = splitURL(url).file;
        var urlext = splitURL(url).ext;
        var slot;

        // populate slots array
        slot = {};
        slot.url = url;
        slot.dir = splitURL(url).dir;
        slot.file = urlname;

        if (urlext == "yaml") {
            slot.defaultScene = url;
            resolve(slot);
        } else if (urlext == "json") {
        // load and parse test json
            readTextFile(url, function(text){
                try {
                    data = JSON.parse(text);
                } catch(e) {
                    console.warn('Error parsing json:', e);
                    // set page title
                    diffSay("Can't parse JSON: <a href='"+url+"'>"+urlname+"</a><br>"+e);
                    // return false;
                }

                // extract test origin metadata
                try {
                    metadata = data.origin;
                } catch (e) {
                    diffSay("Can't parse JSON metadata: <a href='"+url+"'>"+urlname+"</a>");
                    console.warn('metadata problem, continuing', e);
                }
                // convert tests to an array for easier traversal
                slot.tests = Object.keys(data.tests).map(function (key) {
                    // add test's name as a property of the test
                    data.tests[key].name = key;
                    if (local) {
                        data.tests[key].imageURL = null;
                    } else {
                        // add name of pre-rendered image to look for
                        data.tests[key].imageURL = slot.dir + data.tests[key].name + imgType;
                    }
                    return data.tests[key];
                });
                resolve(slot);
            });
        } else {
            diffSay("Don't know how to parse "+urlname+"!");
            reject();
        }
    }).catch(function(err) {
        if (typeof err == 'undefined') err = "Load failed.";
        throw new Error(err);
    });
}

function localBuild() {
    var slot2 = document.getElementById('slot2')
    slot2.value = "Local renders";
}

// copy locations from a collection
function copyTestsFrom(tests) {
    var copy = [];
    for (var i = 0; i < tests.length; i++) {
        copy[i] = {};
        if (typeof copy[i].location != 'undefined') copy[i].location = tests[i].location;
        if (typeof copy[i].name != 'undefined') copy[i].name = tests[i].name;
    }
    return copy;
}

function loadDefaults() {
    return new Promise(function(resolve, reject) {
        loadFile(defaultFile).then(function(result){
            resolve(result.tests);
        });
    });
}

// make sure tests are ready, fill in any gaps
// old:
function prepTests() {
    // reset progress bar
    updateProgress(numTests);
    // clear stored images
    images = {};
    // copy required properties from one test if undefined in the other
    return new Promise(function(resolve, reject) {
        if (typeof slots.slot1.tests == 'undefined' && typeof slots.slot2.tests == 'undefined') {
            diffSay('No views defined in either test file, using default views in <a href src="'+defaultFile+'">'+defaultFile+'</a>');
            Promise.all([
                loadDefaults().then(function(val){slots.slot1.tests = val;}),
                loadDefaults().then(function(val){slots.slot2.tests = val;})
            ]).then(function(){
                resolve();
            });
        } else if (typeof slots.slot1.tests == 'undefined' || slots.slot1.tests.length == 0) {
            diffSay('Using views in '+slots.slot2.file+'.');
            slots.slot1.tests = copyTestsFrom(slots.slot2.tests);
            resolve();
        } else if (typeof slots.slot2.tests == 'undefined' || slots.slot2.tests.length == 0) {
            diffSay('Using views in '+slots.slot1.file+'.');
            slots.slot2.tests = copyTestsFrom(slots.slot1.tests);
            resolve();
        } else {
            resolve();
        }
    }).then(function(){
        // count tests
        if (slots.slot1.tests.length != slots.slot2.tests.length) {
            numTests = Math.min(slots.slot1.tests.length, slots.slot2.tests.length);
            diffSay("Note: The two tests have a different number of views.")
        } else {
            numTests = slots.slot1.tests.length;
        }
        return;
    });
}

// setup output divs and canvases
// new:
function newPrepPage() {
    // subscribe to Tangram's published view_complete event
    frame1.window.scene.subscribe({
        // trigger promise resolution
        view_complete: function () {
                viewComplete1Resolve();
            }
    });
    frame2.window.scene.subscribe({
        // trigger promise resolution
        view_complete: function () {
                viewComplete2Resolve();
            }
    });

    // set status message
    var msg = "Now diffing: <a href='"+slots.slot1.url+"'>"+slots.slot1.file+"</a> vs. ";
    msg += (slot2.value == "Local renders") ? "Local renders" : "<a href='"+slots.slot2.url+"'>"+slots.slot2.file+"</a>";
    msg += "<br>" + numTests + " tests:<br>";
    statusDiv.innerHTML = msg;

    // make diffing canvas
    if (typeof canvas != 'undefined') return; // if it already exists, skip the rest
    canvas = document.createElement('canvas');
    canvas.height = size;
    canvas.width = size;
    ctx = canvas.getContext('2d');
    diff = ctx.createImageData(size, size);

}

// setup output divs and canvases
// old:
function prepPage() {
    // console.log('prepPage')
    // subscribe to Tangram's published view_complete event
    // console.log('prepPage scene?', scene)
    // console.log('prepPage scene.subscribe?', scene.subscribe)
    scene.subscribe({
        // trigger promise resolution
        view_complete: function () {
                viewCompleteResolve();
            }
    });

    // set status message
    var msg = "Now diffing: <a href='"+slots.slot1.url+"'>"+slots.slot1.file+"</a> vs. ";
    msg += (slot2.value == "Local renders") ? "Local renders" : "<a href='"+slots.slot2.url+"'>"+slots.slot2.file+"</a>";
    msg += "<br>" + numTests + " tests:<br>";
    statusDiv.innerHTML = msg;

    // make canvas
    if (typeof canvas != 'undefined') return; // if it already exists, skip the rest
    canvas = document.createElement('canvas');
    canvas.height = size;
    canvas.width = size;
    ctx = canvas.getContext('2d');
    diff = ctx.createImageData(size, size);

}

function setEither(var1, var2) {
    if (typeof var1 == 'undefined' || typeof var2 == 'undefined') {
        if (typeof var1 == 'undefined' && typeof var2 == 'undefined') {
            return(null);
        } else if (typeof var1 == 'undefined') {
            var1 = var2;
        } else if (typeof var2 == 'undefined') {
            var2 = var1;
        }
    }
    return [var1, var2];
}




//
// test functions
//


// parse view object and adjust map
function parseLocation(loc) {
    if (Object.prototype.toString.call(loc) === '[object Array]') {
        return loc; // no parsing needed
    } else if (typeof(loc) === "string") {
        // parse string location as array of floats
        if (loc.indexOf(',') > 0 ) { // comma-delimited
            var location = loc.split(/[ ,]+/);
        } else if (loc.indexOf('/') > 0 ) { // slash-delimited
            location = loc.split(/[\/]+/);
            location = [location[1], location[2], location[0]]; // re-order
        }
        location = location.map(parseFloat);
        // return updated location
        return location;
    } else {
        console.warn("Can't parse location:", loc);
    }
}

// load an image from a file
function loadImage (url) {
    // console.log('loadImage:', url);
    return new Promise(function(resolve, reject) {
        // if (typeof url == "undefined") {
        //     return reject("image url undefined");
        // }
        var image = new Image();
        // set up events
        image.onload = function(r) {
            // console.log('well?', r);
            // console.log('this:', this);
            return resolve(this);
        };
        image.onerror = function(e) {
            // console.log('hmm.', e.stack);
            // console.log('this:', this);

            return reject("couldn't load "+url);
        };
        image.crossOrigin = 'anonymous';
        url = convertGithub(url);
        // force-refresh any local images with a cache-buster
        if (url.slice(-4) == imgType) url += "?" + new Date().getTime();
        // try to load the image
        image.src = url;
    });
}

// get image data object using a canvas
function imageData (img, canvas) {
    return new Promise(function(resolve, reject) {
        // draw image to the canvas
        var context = canvas.getContext("2d");
        context.drawImage(img,
                          0, 0, img.width, img.height,
                          0, 0, canvas.width, canvas.height);
        // make the data available to pixelmatch
        var data = context.getImageData(0, 0, size, size);
        resolve(data);
    }, function(err) {
        console.warn('imageData err:', err);
        data = null;
        reject(data);
    });
};

// capture the current tangram map
function newScreenshot (save, name, frame) {
    // console.log(name, 'screenshot:')
    var scene = frame.window.scene;
    return scene.screenshot().then(function(data) {
        // console.log(name, 'screenshot success:', data)
        // save it to a file
        if (save) saveImage(data.blob, name);
        return loadImage(linkFromBlob( data.blob ));
    }).catch(function(err){
        // console.warn('screenshot fail:', err);
        return Promise.reject();
    });
};

// capture the current tangram map
// old:
function screenshot (save, name) {
    // console.log(name, 'screenshot:')
    return scene.screenshot().then(function(data) {
        // console.log(name, 'screenshot success:', data)
        // save it to a file
        if (save) saveImage(data.blob, name);
        return loadImage(linkFromBlob( data.blob ));
    }).catch(function(err){
        // console.warn('screenshot fail:', err);
        return Promise.reject();
    });
};

// use Tangram's view_complete event to resolve a promise
// new: make one for each frame
var viewComplete1Resolve, viewComplete1Reject;
var viewComplete1;
var viewComplete2Resolve, viewComplete2Reject;
var viewComplete2;
// todo: make this less fugly
function newResetViewComplete(frame) {
    if (frame.iframe.id == "map1") {
        viewComplete1 = new Promise(function(resolve, reject){
            viewComplete1Resolve = function(){
                // console.log('viewComplete1Resolve()!');
                resolve();
            };
            viewComplete1Reject = function(e){
                // console.log("> viewComplete FAIL");
                reject();
            };
        });
    } else if (frame.iframe.id == "map2") {
        viewComplete2 = new Promise(function(resolve, reject){
            viewComplete2Resolve = function(){
                // console.log('viewComplete2Resolve()!');
                resolve();
            };
            viewComplete2Reject = function(e){
                // console.log("> viewComplete FAIL");
                reject();
            };
        });
    }
}

// use Tangram's view_complete event to resolve a promise
// old
var viewCompleteResolve, viewCompleteReject;
var viewComplete;
function resetViewComplete() {
    viewComplete = new Promise(function(resolve, reject){
        viewCompleteResolve = function(){
            resolve();
        };
        viewCompleteReject = function(e){
            // console.log("> viewComplete FAIL");
            reject();
        };
    });
}

// load a map position and zoom
// todo: use new per-iframe viewComplete
function newLoadView (view, location, frame) {
    // console.log('newLoadView');
    var t = 0;
    return new Promise(function(resolve, reject) {
        if (!view) reject('no view');
        // if (!view.url) reject('no view url');
        // if (!view.location) reject('no view location');
        // load and draw scene
        var url = convertGithub(view.url);
        var name = splitURL(url).file;
        // if it's drawing, wait for it to finish
        newResetViewComplete(frame);
        var scene = frame.window.scene;
        var map = frame.window.map;
        scene.last_valid_config_source = null; // overriding a Tangram fail-safe
        return scene.load(url).then(function(r) {
            // console.log(frame.iframe.id, 'scene.load() triggered')
            scene.animated = false;
            map.setView([location[0], location[1]], location[2]);
            // scene.requestRedraw(); // necessary?
            // wait for map to finish drawing, then return
            // todo: trigger each frame's viewComplete
            // not sure how this is going to work.
            // todo: make this less fugly
            if (frame.iframe.id == "map1") {
                // console.log('triggering viewcomplete1:', viewComplete1)
                return viewComplete1.then(function(){
                    // console.log('map1 view_complete!')
                    resolve();
                }).catch(function(error) {
                    // console.log('map1 view_complete error')
                    reject(error);
                });
            } else if (frame.iframe.id == "map2") {
                // console.log('triggering viewcomplete2:')
                return viewComplete2.then(function(){
                    // console.log('map2 view_complete!')
                    resolve();
                }).catch(function(error) {
                    // console.log('map2 view_complete error')
                    reject(error);
                });
            }
        }).catch(function(error) {
            console.log('scene.load() error:', error)
            reject(error);
        });
    });
}

// load a map position and zoom
// old:
function loadView (view, location) {
    var t = 0;
    return new Promise(function(resolve, reject) {
        if (!view) reject('no view');
        // if (!view.url) reject('no view url');
        // if (!view.location) reject('no view location');
        // load and draw scene
        var url = convertGithub(view.url);
        var name = splitURL(url).file;
        // if it's drawing, wait for it to finish
        resetViewComplete();
        scene.last_valid_config_source = null; // overriding a Tangram fail-safe
        return scene.load(url).then(function(r) {
            scene.animated = false;
            map.setView([location[0], location[1]], location[2]);
            // scene.requestRedraw(); // necessary?
            // wait for map to finish drawing, then return
            return viewComplete.then(function(){
                resolve();
            }).catch(function(error) {
                reject(error);
            });
        }).catch(function(error) {
            // console.log('scene.load() error:', error)
            reject(error);
        });
    });
}

function goClick() {
    alertDiv.innerHTML = '';
    diffSay("Starting Diff");
    updateURL();
    goButton.blur();

    // clear out any existing tests
    tests.innerHTML = "";
    data = null;
    metadata = null;

    Promise.all([loadFile(slot1.value),loadFile(slot2.value),frame1Ready, frame2Ready]).then(function(result){
        slots.slot1 = result[0];
        slots.slot2 = result[1];
        goButton.setAttribute("style","display:none");
        stopButton.setAttribute("style","display:inline");
        proceed();
    }).catch(function(err){
        diffSay("Please enter two URLs above.");
        console.log(err);
        diffSay(err);
    });
}

function stopClick() {
    stopButton.blur();
    diffSay("Stopping Diff.");
    stop();
}


function stop() {
    slots.slot1.tests = [];
    slots.slot2.tests = [];
    stopButton.setAttribute("style","display:none");
    goButton.setAttribute("style","display:inline");
}






//
// perform the test
//

function proceed() {
    // todo: prep two maps
    // something like:
    return Promise.all([prepMap(), newPrepMap(frame1), newPrepMap(frame2)]).then(function(val) {
    // return prepMap().then(function(val) {
        map = val[0];
        prepTests().then(function() {
            newPrepPage();
            prepPage();
            prepBothImages();
        });
    });
}

// prep an image to send to the diff
// todo: send test data to a map in an iframe and return the data from the canvas
// new:
function newPrepImage(test, frame) {
    // console.log('newPrepImage', test.name, frame.iframe.id)
    return new Promise(function(resolve, reject) {
        // if there's an image for the test, load it
        loadImage(test.imageURL).then(function(result){
            diffSay(test.name+imgType+" found for "+test.file)
            // store it
            test.img = result;
            imageData(result, canvas).then(function(result){
                // then return the data object
                // console.log(1);
                return resolve(test.data = result.data);
            }).catch(function(err){
                console.log("> imageData err:", err);
            });
        }).catch(function(err) {
            console.warn(test.name+": "+err);
            // console.warn(1, test.name+": "+err);
            // no image? load the test view in the map and make a new image
            var loc = parseLocation(test.location);
            // todo: replace with new version
            newLoadView(test, loc, frame).then(function(result){
                // console.log(2);
                // grab a screenshot and store it
                // todo: screenshot a specific frame
                newScreenshot(writeScreenshots, name, frame).then(function(result){
                    // console.log(3);
                    test.img = result;
                    // then return the data object
                    imageData(result, canvas).then(function(result){
                        // console.log('imageData result:', result);
                        // console.log('test:', test);
                        // return "test resolve"
                        // console.log(2);
                        return resolve(test.data = result.data);
                    }).catch(function(error){
                        console.log('imageData error:', error);
                        // console.log(3);
                        throw new Error(error);
                    });
                }).catch(function(error){
                    console.log('screenshot error:', error);
                    // console.log(4);
                    throw new Error(error);
                });
            }).catch(function(error){
                console.log('loadView error:', error);
                // console.log(5);
                reject(error);
            });

            // todo: replace with new version
            // loadView(test, loc).then(function(result){
            //     // grab a screenshot and store it
            //     screenshot(writeScreenshots, name).then(function(result){
            //         test.img = result;
            //         // then return the data object
            //         imageData(result, canvas).then(function(result){
            //             return resolve(test.data = result.data);
            //         }).catch(function(error){
            //             console.log('imageData error:', error);
            //             throw new Error(error);
            //         });
            //     }).catch(function(error){
            //         console.log('screenshot error:', error);
            //         throw new Error(error);
            //     });;
            // }).catch(function(error){
            //     // console.log('loadView error:', error);
            //     reject(error);
            // });
            // console.log(4);
        });
    });
}

// prep an image to send to the diff
// old:
function prepImage(test) {
    return new Promise(function(resolve, reject) {
        // if there's an image for the test, load it
        loadImage(test.imageURL).then(function(result){
            diffSay(test.name+imgType+" found for "+test.file)
            // store it
            test.img = result;
            imageData(result, canvas).then(function(result){
                // then return the the data object
                return resolve(test.data = result.data);
            }).catch(function(err){
                console.log("> imageData err:", err);
            });
        }).catch(function(err) {
            console.warn(test.name+": "+err);
            // no image? load the test view in the map and make a new image
            var loc = parseLocation(test.location);
            loadView(test, loc).then(function(result){
                // grab a screenshot and store it
                screenshot(writeScreenshots, name).then(function(result){
                    test.img = result;
                    // then return the data object
                    imageData(result, canvas).then(function(result){
                        return resolve(test.data = result.data);
                    }).catch(function(error){
                        console.log('imageData error:', error);
                        throw new Error(error);
                    });
                }).catch(function(error){
                    console.log('screenshot error:', error);
                    throw new Error(error);
                });;
            }).catch(function(error){
                // console.log('loadView error:', error);
                reject(error);
            });
        });
    });
}

// prep scene file urls
function prepStyles(test1, test2) {
    return new Promise(function(resolve, reject) {
        if (typeof test1.url == 'undefined') {
            if (typeof slots.slot1.defaultScene != 'undefined') {
                test1.url = slots.slot1.defaultScene;
            }
        }
        if (typeof test2.url == 'undefined') {
            if (typeof slots.slot2.defaultScene != 'undefined') {
                test2.url = slots.slot2.defaultScene;
                // console.log('test2.url:', test2.url);
            }
        }
        var url = setEither(test1.url, test2.url);
        if (url == null) {
            url = setEither(slots.slot1.defaultScene, slots.slot2.defaultScene);
        }
        if (url == null) {
            diffSay("No scenefile URLs found for either test!");
            stopClick();
            return;
        } else {

            // if (typeof test1.url == 'undefined') {
            //     diffSay(test1.name+': no scene found in '+test1.file+' – copying from '+test2.file);
            // }
            // if (typeof test2.url == 'undefined') {
            //     diffSay(test2.name+': no scene found in '+test2.file+' – copying from '+test1.file);
            // }

            test1.url = url[0];
            test2.url = url[1];
            if (!isPathAbsolute(test1.url)) {
                test1.url = test1.dir + test1.url;
            }
            if (!isPathAbsolute(test2.url)) {
                test2.url = test2.dir + test2.url;
            }
        }
        return resolve({'url1': test1.url, 'url2': test2.url});
    });
}

function prepLocations(test1, test2) {
    return new Promise(function(resolve, reject) {
        var location = setEither(test1.location, test2.location);
        if (location != null) {
            test1.location = location[0];
            test2.location = location[1];
            return resolve({'loc1': test1.location, 'loc2': test2.location});
        } else {
            diffSay("No locations set for either test - using default location.");
            // todo - use a series of default locations?
            // loadFile("tests/locations.json").then(function(result) {
            //     console.log('result:', result);            
            //     location = result;
            //     test1.location = location[0];
            //     test2.location = location[1];
            //     return resolve({'loc1': test1.location, 'loc2': test2.location});
            // });
            location = [40.70532700869127,-74.00976419448854,16];
            return resolve({'loc1': location, 'loc2': location});
        }
    });
}

// load or create the test images
function prepBothImages() {
    // load next test in the lists
    var test1 = slots.slot1.tests.shift();
    var test2 = slots.slot2.tests.shift();

    // if (typeof test1 == 'undefined' || typeof test2 == 'undefined' ) {
    //     diffAdd("Missing test in slot ");
    //     if (typeof test1 == "undefined") diffAdd("1");
    //     if (typeof test2 == "undefined") diffAdd("2");
    //     diffSay(" - using test from other slot.")
    //     stopClick();
    // }

    if (typeof test1 == 'undefined' && typeof test2 == 'undefined' ) {
        diffSay("No tests defined in either file.");
        stopClick();
        return false;
    }

    function nextDiff() {
        try {
            // todo: replace with newDoDiff()
            doDiff(test1, test2);
        } catch(e) {
            console.log('doDiff failed:', e.stack);
        }
        if (slots.slot1.tests.length > 0) {
            prepBothImages();
        } else {
            stop();
            diffSay("Done!<br>");
            console.log("Done!");
        }
    }

    test1.file = slots.slot1.file;
    test2.file = slots.slot2.file;
    test1.dir = slots.slot1.dir;
    test2.dir = slots.slot2.dir;

    // prep scene file urls
    var p1 = prepStyles(test1, test2).then(function(styles) {
        test1.url = styles.url1;
        test2.url = styles.url2;
    });
    // prep locations
    var p2 = prepLocations(test1, test2).then(function(locations) {
        test1.location = locations.loc1;
        test2.location = locations.loc2;
    });

    // todo: replace with concurrent rendering - something like:
    Promise.all([p1, p2])
    .then(function() {
        return Promise.all([newPrepImage(test1, frame1), newPrepImage(test2, frame2)]);
    }).then(function(result){
        // console.log('prepimage result:', result)
        return result;
    }).then(function(result){
        nextDiff();
    }).catch(function(e){
        diffSay("problem with "+test2.name+" in "+splitURL(test2.url).file+": "+e.name);
        nextDiff();
    });

    // old:
    // Promise.all([p1, p2])
    // .then(function(result){
    //     return prepImage(test1);
    // })
    // .catch(function(e){
    //     // console.log('prep1 error:', e);
    //     diffSay("problem with "+test1.name+" in "+splitURL(test1.url).file+": "+e.name);
    // })
    // .then(function(result){
    //     return prepImage(test2);
    // })
    // .then(function(result){
    //     nextDiff();
    // }).catch(function(e){
    //     // console.log('prep2 error:', e);
    //     diffSay("problem with "+test2.name+" in "+splitURL(test2.url).file+": "+e.name);
    //     nextDiff();
    // });
}

// perform the image comparison and update the html
function doDiff( test1, test2 ) {
    if (test1.data && test2.data) {
        // run the diff
        try {
            var difference = pixelmatch(test1.data, test2.data, diff.data, size, size, {threshold: 0.1});
        } catch(e) {
            throw new Error("> diff error:", e);
        }
        // calculate match percentage
        var match = 100-(difference/(lsize*lsize)*100*100)/100;
        var matchScore = Math.floor(match);
        // put the diff in its canvas
        ctx.putImageData(diff, 0, 0);
    } else {
        // generating new image
        match = 100;
        matchScore = "";
    }

    // update progressbar
    updateProgress(slots.slot1.tests.length);

    // update master percentage
    scores[test1.name] = match;
    var totalSum = 0;
    for (var v in scores) {
        totalSum += scores[v];
    }
    // totalScore = Math.floor(totalSum/(100*count)*100);
    // var threatLevel = totalScore > 99 ? "green" : totalScore > 98 ? "orange" : "red";
    // totalScoreDiv.innerHTML = "<span class='matchScore' style='color:"+threatLevel+"'>"+totalScore+"% match</span>";

    // make an output row
    makeRow(test1, test2, matchScore);

    images[test1.name] = {};
    images[test1.name].img1 = test1.img;
    images[test1.name].img2 = test2.img;

    // save diff to new image and save a strip
    var data = atob(diffImg.src.slice(22));
    var buffer = new Uint8Array(data.length);
    for (var j = 0; j < data.length; ++j) {
        buffer[j] = data.charCodeAt(j);
    }
    var blob = new Blob([buffer], { type: 'image/png' });
    var diff2 = new Image();
    diff2.height=size;
    diff2.width=size;
    diff2.onload = function() {
        images[test1.name].diffImg = diff2;
        images[test1.name].strip = makeStrip([test1.img, test2.img, diff2], lsize); 
    }
    diff2.src = linkFromBlob( blob );
};

function refresh(test) {
    queue.push(test);
    startRender();
}

function makeRow(test1, test2, matchScore) {
    // console.log('makeRow:', test1, test2);
    // check to see if div already exists (if re-running a test);
    var testdiv = document.getElementById(test1.name);

    // if a row for this test doesn't already exist:
    if (testdiv === null) {
        // generate one
        var testdiv = document.createElement('div');
        testdiv.className = 'test';
        if (typeof test1.name == 'undefined') {
            test1.name = 'undefined'+(numTests-slots.slot1.tests.length);
        }
        testdiv.id = test1.name;
        allTestsDiv.insertBefore(testdiv, allTestsDiv.firstChild);
    } else {
        // clear it out
        testdiv.innerHTML = "";
    }
    var title = document.createElement('div');
    title.className = 'testname';
    // make test title a link to a live version of the test

    // test1 is undefined
    var testlink = "http://tangrams.github.io/tangram-frame/?url="+convertGithub(test1.url)+"#"+test1.location[2]+"/"+test1.location[0]+"/"+test1.location[1];
    title.innerHTML = "<a target='_blank' href='"+convertGithub(testlink)+"'>"+test1.name+"</a>";
    title.innerHTML += " <a target='_blank' href='"+test1.url+"'>"+splitURL(test1.url).file+"</a>";
    testdiv.appendChild(title);

    var column1 = document.createElement('span');
    column1.className = 'column';
    column1.id = "column1";
    column1.innerHTML = "1<br>";
    testdiv.appendChild(column1);

    var column2 = document.createElement('span');
    column2.className = 'column';
    column2.id = "column2";
    column2.innerHTML = "2<br>";
    testdiv.appendChild(column2);

    var diffcolumn = document.createElement('span');
    diffcolumn.className = 'column';
    diffcolumn.id = "diff";
    diffcolumn.innerHTML = "diff<br>";
    testdiv.appendChild(diffcolumn);

    // console.log('test1.img:', test1.img);
    // console.log('test2.img:', test2.img);
    // insert images
    try {
        test1.img.width = size;
        test1.img.height = size;
        column1.appendChild( test1.img );
    } catch(e) {}
    
    try {
        test2.img.width = size;
        test2.img.height = size;
        column2.appendChild( test2.img );
    } catch(e) {}

    // CONTROLS //

    var controls = document.createElement('span');
    controls.className = 'controls';
    testdiv.appendChild(controls);

    var threatLevel = matchScore > 99 ? "green" : matchScore > 95 ? "orange" : "red";

    if (matchScore != "") {
        matchScore += "% match";
        diffImg = document.createElement('img');
        diffImg.src = canvas.toDataURL("image/png");
        diffImg.width = size;
        diffImg.height = size;
        diffcolumn.appendChild( diffImg );
    }

    // controls.innerHTML = "<div class='matchScore' style='color:"+threatLevel+"'>"+matchScore+"</div><br>";

    var refreshButton =  document.createElement('button');
    refreshButton.innerHTML = "refresh " + test1.name;
    // controls.appendChild(refreshButton);
    refreshButton.onclick = function() {refresh(test1);}

    var exportButton =  document.createElement('button');
    exportButton.innerHTML = "make PNG";
    // store current value of these global variables
    exportButton.onclick = function() {
        popup(images[test1.name].strip, size * 3, size);
    };
    controls.appendChild(exportButton);

    var exportGifButton =  document.createElement('button');
    exportGifButton.innerHTML = "make GIF";
    exportGifButton.onclick = function() {
        makeGif([images[test1.name].img1, images[test1.name].img2], test1.name);
    };
    controls.appendChild(exportGifButton);
}






//
// output
//

// save an image in a blob with a POST request to the server
function saveImage( file, filename ) {
    var url = '/save';
    var data = new FormData();

    data.append("image", file, filename);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.onload = function () {
    };
    xhr.send(data);
}

// http://stackoverflow.com/questions/8022425/getting-blob-data-from-xhr-request
function blobFromLink(url, name) {
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';
        xhr.onload = function () {
            if (this.status == 200) {
                resolve({"blob":this.response, "name":name});
            }
        };
        xhr.send();
    });
}

// save all new images
function saveImages() {
    diffSay("Saving "+Object.keys(images).length+" images…")
    for (var name in images) {
        console.log('saving', name);
        var link = images[name].img2.src;
        blobFromLink(link, name).then(function(response){
            saveImage(response.blob, response.name);
        });
    }
    diffSay(" Done.<br>")
}

function makeStrip(images, size) {
    var c = document.createElement('canvas');
    c.width = size*images.length;
    c.height = size;
    var ctx=c.getContext("2d");
    for (var x = 0; x < images.length; x++) {
        ctx.drawImage(images[x], size * x, 0, size, size);
    }
    return c.toDataURL("image/png");
}

function makeGif(images, name) {
    var gif = new GIF({
      workers: 1,
      quality: 10,
      width: lsize,
      height: lsize,
    });

    for (var y = 0; y < images.length; y++) {
        gif.addFrame(images[y]);
    }

    gif.on('finished', function(blob) {
        saveAs(blob, name+".gif");
    });

    gif.render();
}

function popup(img, width, height) {
    var data = '<img width='+width+' height='+height+' src="' + img + '"/>';
    var myWindow = window.open("data:text/html," + encodeURIComponent(data));
}

function makeContactSheet() {

    // count available strips
    var len = Object.keys(images).length;

    var c = document.createElement('canvas');
    c.width = lsize*3;
    c.height = lsize*len;
    var ctx=c.getContext("2d");

    // assemble strips
    var i = 0;
    var loaded = 0;
    for (var x in images) {
        var img = new Image();
        img.i = i;
        img.id = x;
        img.onload = function() {
            ctx.drawImage(this, 0, lsize * this.i);
            // if that's the last image, write the whole thing out
            if (loaded == len - 1) {
                // Get data URL, convert to blob
                // Strip host/mimetype/etc., convert base64 to binary without UTF-8 mangling
                // Adapted from: https://gist.github.com/unconed/4370822
                var url = c.toDataURL('image/png');
                var data = atob(url.slice(22));
                var buffer = new Uint8Array(data.length);
                for (var j = 0; j < data.length; ++j) {
                    buffer[j] = data.charCodeAt(j);
                }
                var blob = new Blob([buffer], { type: 'image/png' });
                // use FileSaver.js
                saveAs(blob, 'differ-' + (+new Date()) + '.png');
            }
            loaded++;
        }
        img.src = images[x].strip;
        i++;
    }
}

function makeInfoJSON() {
    var j = {};
    j.origin = {
        "useragent": navigator.userAgent,
        "devicePixelRatio": window.devicePixelRatio,
        "time": loadTime,
        "testFile": testsFile
    };
    try {
        j.tests = data.tests;
    } catch(e) {
        throw new Error(e);
        return false;
    }
    saveData(j, 'differ-' + (+new Date()) + '.json');
}

var saveData = (function () {
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style = "display: none";
    return function (data, fileName) {
        var json = JSON.stringify(data, null, 2),
            blob = new Blob([json], {type: "octet/stream"}),
            url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);
    };
}());

window.onload = function() {
    parseQuery();
    // goButton.click();
}