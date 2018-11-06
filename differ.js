// A utility to draw and compare Tangram maps.
// Uses Vladimir Agafonkin's pixelmatch: https://github.com/mapbox/pixelmatch
// (c) 2016-2018 Peter Richardson, MIT license

// "use strict";
/*jslint browser: true*/
/*global Tangram */





//
// initialize variables
//

// set preferences
var imgType = ".png";
var size = 250; // physical pixels
var writeScreenshots = false; // write new map images to disk?
var defaultFile = "tests/default.json"; // default view locations
// var defaultFile = "tests/default-coordinate.json"; // default view locations
document.getElementById("content").style.maxWidth = size*4+'px';

// other internal variables
var slots = {}, images = {},
    diffImg = new Image(), diffData, diffCanvas, diffCtx,
    slot1depth = {val: 0},
    slot2depth = {val: 0};
var slot1tests = {tests: []},
    slot2tests = {tests: []};
var lsize = size * window.devicePixelRatio; // logical pixels
var numTests, scores = [], totalScore = 0;
var data, metadata;
var startTime, loadTime = Date();
var defaultScene = "simple.yaml";
var defaultWarning = false;
var running = false;

// shortcuts to elements
function get(id) {
    return document.getElementById(id);
}
var slot1 = get("slot1");
var slot2 = get("slot2");
var library1 = get("library1");
var library2 = get("library2");
var useImages1 = get("useImages1");
var useImages2 = get("useImages2");
var tests = get("tests");

// two iframes to hold maps
var frame1 = {
    'iframe': get("map1"),
    'window': get("map1").contentWindow,
    'document': get("map1").contentDocument
};
var frame2 = {
    'iframe': get("map2"),
    'window': get("map2").contentWindow,
    'document': get("map2").contentDocument
};

frame1.iframe.style.height = size+"px";
frame1.iframe.style.width = size+"px";
frame2.iframe.style.height = size+"px";
frame2.iframe.style.width = size+"px";

// browser check
var ua = navigator.userAgent.toLowerCase();
var chrome = false;
var safari = false;
if (ua.indexOf('safari') != -1) {
    if (ua.indexOf('chrome') > -1) {
    chrome = true;
    } else {
    safari = true;
    }
}

// can only use saveButton if running on a local node server
if (window.location.hostname != "localhost" ) get('saveButton').setAttribute("style", "display:none");





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

// find query terms in the URL
function parseQuery() {
    // test or yaml file?
    var url = getQueryVariable("1");
    if (url !== "") {
        slot1.value = url;
    }
    url = getQueryVariable("2");
    if (url !== "") {
        slot2.value = url;
    }
    // tangram version
    var lib = getQueryVariable("lib1");
    if (lib !== "") {
        library1.value = lib;
    }
    lib = getQueryVariable("lib2");
    if (lib !== "") {
        library2.value = lib;
    }
    // use prerendered images checkbox
    var check = getQueryVariable("useimages1");
    if (check) {
        useImages1.checked = true;
    }
    check = getQueryVariable("useimages2");
    if (check) {
        useImages2.checked = true;
    }
    // start immediately
    url = getQueryVariable("go");
    if (url !== "") {
        get('goButton').click();
    }
}

// add text to the output div
function diffAdd(txt) {
    setTimeout(function() {
        get('alert').innerHTML += txt;
        get('alert').scrollTop = get('alert').scrollHeight;
    }, 50);
}
function diffSay(txt) {
    diffAdd(txt+"<br>");
}

// convert github links to raw github files
function convertGithub(url) {
    var a = document.createElement('a');
    a.href = url;
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
        get('goButton').click();
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

// parse a URL
function parseURL(url) {
    var parser = document.createElement('a');
    parser.href = url;
    return parser;
}

// load a file from a URL
function readTextFile(file, callback, errorback) {
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
        } else if (rawFile.readyState === 4 && rawFile.status == "404") {
            console.error("404 – can't load file", file);
            errorback("404 – can't load file "+ file);
        } else if (rawFile.readyState === 4 && rawFile.status == "401") {
            // diffSay("401 - can't load file <a href='"+file+"'>"+filename+"</a>");
            console.error("401 – can't load file", file);
            errorback("401 – can't load file "+ file);
            return false;
        } else if (rawFile.readyState === 4) {
            diffSay("Had trouble loading the file: <a href='"+file+"'>"+filename+"</a>");
            if (parseURL.host == "github.com") {
                diffSay("I notice you're trying to load a file from github, make sure you're using the \"raw\" file!");
            }
            errorback("Problem with "+ file);
            return false;
        }
    };
    rawFile.send(null);
}

// set URL in location bar
function updateURL() {
    var parser = document.createElement('a');
    parser.href = window.location;
    var url = parser.pathname+"?1="+encodeURI(slot1.value)+"&2="+encodeURI(slot2.value)+"&lib1="+encodeURI(library1.value)+"&lib2="+encodeURI(library2.value)+(useImages1.checked ? "&useimages1" : "")+(useImages2.checked ? "&useimages2" : "")+"&go";
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
    get('progressbar').setAttribute("style", "width:"+percent + "%");
    get('progressbarTop').setAttribute("style", "width:"+percent + "%");
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

function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}

function rgbToHex(r, g, b) {
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

// flash background color
function flashDone() {
    var steps = 25;
    for (var x = 1; x < steps; x++) {
        setColorDelay(x, steps);
    }
}

function setColorDelay(x, steps) {
    var ms = 20; // delay between steps in ms
    setTimeout(function() {
        var step = 255 / steps;
        var c = step * x;
        var color = rgbToHex(parseInt(c), 255, parseInt(c));
        document.body.style.background = color;
    }, x * ms);
    // reset to white
    setTimeout(function() {
        document.body.style.background = 'white';
    }, ms * (steps + 1));
}

// first add raf shim
// http://www.paulirish.com/2011/requestanimationframe-for-smart-animating/
window.requestAnimFrame = (function(){
    return  window.requestAnimationFrame       ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame    ||
            function( callback ){
            window.setTimeout(callback, 1000 / 60);
            };
})();

// keep scroll at the bottom if already at the bottom
function scrollToY(scrollTargetY, speed, easing) {
    // scrollTargetY: the target scrollY property of the window
    // speed: time in pixels per second
    // easing: easing equation to use

    var scrollY = window.scrollY,
        scrollTargetY = scrollTargetY || 0,
        speed = speed || 2000,
        easing = easing || 'easeOutSine',
        currentTime = 0;

    // min time .1, max time .8 seconds
    var time = Math.max(0.1, Math.min(Math.abs(scrollY - scrollTargetY) / speed, 0.8));

    // easing equations from https://github.com/danro/easing-js/blob/master/easing.js
    var easingEquations = {
            easeOutSine: function (pos) {
                return Math.sin(pos * (Math.PI / 2));
            },
            easeInOutSine: function (pos) {
                return (-0.5 * (Math.cos(Math.PI * pos) - 1));
            },
            easeInOutQuint: function (pos) {
                if ((pos /= 0.5) < 1) {
                    return 0.5 * Math.pow(pos, 5);
                }
                return 0.5 * (Math.pow((pos - 2), 5) + 2);
            }
        };

    // add animation loop
    function tick() {
        currentTime += 1 / 60;
        var p = currentTime / time;
        var t = easingEquations[easing](p);

        if (p < 1) {
            requestAnimFrame(tick);
            window.scrollTo(0, scrollY + ((scrollTargetY - scrollY) * t));
        } else {
            window.scrollTo(0, scrollTargetY);
        }
    }

    // call it once to get started
    tick();
}





//
// prep scene
//

function prepMap(which) {
    return new Promise(function(resolve, reject) {
        var frame = which.iframe;
        var mapWindow = which.window;

        // check that frame initialized
        if (typeof mapWindow.map === 'undefined') {
            diffSay("Couldn't load <a href='"+frame.src+"'>"+frame.src+"</a>");
            stopClick();
        }

        // not sure why the others hit a race condition but this doesn't ಠ_ಠ
        var map = frame.contentDocument.getElementById("map");
        // var map = which['document'].getElementById("map");
        // var map = which.document.getElementById("map");

        map.style.height = size+"px";
        map.style.width = size+"px";

        // remove weird 2px border Leaflet adds to map when you resize it
        mapWindow.map.invalidateSize();

        resolve(mapWindow.map);
    });
}

// parse url and load the appropriate file, then create tests
function loadFile(url, args) {
    var useImages = args.useImages;
    var depth = args.depth;
    var tests = args.tests;
    var scene = args.scene;
    if (typeof depth == 'undefined') depth = {val: 0};
    // increment depth value
    depth.val++;
    return new Promise(function(resolve, reject) {
        if (url === "") {
            throw new Error("Empty slot.");
            reject();
        }
        var originalurl = url.slice();
        // if it's a github url, get the raw file
        url = convertGithub(url);
        var urlname = splitURL(url).file;
        var urlext = splitURL(url).ext;

        // populate slots array
        var slot = {};
        slot.originalurl = originalurl;
        slot.url = url;
        slot.dir = splitURL(url).dir;
        slot.file = urlname;

        if (typeof slot.tests === 'undefined') slot.tests = [];
        if (typeof tests === 'undefined') tests = {};
        if (typeof tests.tests === 'undefined') tests.tests = [];

        if (urlext == "yaml" || urlext == "zip") {
            slot.defaultScene = url;
            // set a global default scene
            defaultScene = url;
            // decrement depth value
            depth.val--;
            if (depth.val === 0) {
                // resolving with a yaml
                defaultScene = url;
                resolve(slot);
            }
        } else if (urlext == "json") {
        // load and parse test json
            try {
                readTextFile(url, function(text){
                    try {
                        data = JSON.parse(text);
                    } catch(e) {
                        console.warn('Error parsing json:', e);
                        // set page title
                        diffSay("Can't parse JSON: <a href='"+url+"'>"+urlname+"</a><br>"+e);
                        return stopClick();
                    }

                    // extract test origin metadata
                    try {
                        metadata = data.origin;
                    } catch (e) {
                        diffSay("Can't parse JSON metadata: <a href='"+url+"'>"+urlname+"</a>");
                        console.warn('metadata problem, continuing', e);
                    }

                    // convert tests to an array for easier traversal
                    var newTests = Object.keys(data.tests).map(function (key) {
                        if (typeof data.tests[key].url === 'undefined') {
                            if (typeof scene !== 'undefined') data.tests[key].url = scene;
                            else {
                                if (!defaultWarning) {
                                    diffSay("No scene specified, using "+defaultScene);
                                    defaultWarning = true;
                                }
                                data.tests[key].url = defaultScene;
                            }
                        }
                        var r = new RegExp('^(?:[a-z]+:)?//', 'i');
                        var testUrl, slotUrl;
                        // if the test url is a json, load it recursively
                        if (data.tests[key].url.split('.').pop() == "json"){

                            testUrl = data.tests[key].url;
                            if (typeof tests != 'undefined') {
                            }

                            // if the test url is relative, prepend the parent's root directory
                            // test for relative urls
                            if (r.test(data.tests[key].url) === false ) {
                                // make sure there's only one slash at the join:
                                // remove any trailing slash from parent url
                                slotUrl = slot.dir.replace(/\/$/, "");
                                // remove any leading slash from test url
                                testUrl = testUrl.replace(/^\/|\/$/g, '');
                                // prepend slot.dir to path
                                testUrl = slotUrl + '/' + testUrl;
                            }
                            loadFile(testUrl, {useImages: false, depth: depth, tests: tests}).then(function(result) {
                            });
                        } else {
                            // add test's name as a property of the test
                            data.tests[key].name = key;
                            testUrl = data.tests[key].url;
                            // if the test url is relative, prepend the parent's root directory
                            // set full path of scene file
                            if (r.test(data.tests[key].url) === false ) {
                                // make sure there's only one slash at the join:
                                // remove any trailing slash from parent url
                                slotUrl = slot.dir.replace(/\/$/, "");
                                // remove any leading slash from test url
                                testUrl = testUrl.replace(/^\/|\/$/g, '');
                                // prepend slot.dir to path
                                data.tests[key].url = slot.dir + data.tests[key].url;
                            }
                            // if checkbox is checked
                            if (useImages) {
                                // add path of pre-rendered image to look for
                                data.tests[key].imageURL = slot.dir + data.tests[key].name + imgType;
                            }
                            return data.tests[key];
                        }
                    });
                    // add new tests to slot test list
                    tests.tests = tests.tests.concat(newTests);

                    depth.val--;
                    if (depth.val === 0) {
                        slot.tests = slot.tests.concat(tests.tests);
                    }
                    resolve(slot);

                }, function(error) {
                    console.log('plobrem:', error);
                    reject(error);
                });
            } catch (err) {
                if (typeof err == 'undefined') {
                    err = "File load failed.";
                } else {
                    console.log('whups', err);
                }
            }
        } else {
            console.log("Unexpected filetype: "+url);
            diffSay("Unexpected filetype: <a href='"+url+"'>"+urlname+"</a>");
            reject();
        }
    }).catch(function(error) {
        if (typeof error == 'undefined') error = "File load failed.";
        throw error;
    });
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

// load some default tests if none are provided
function loadDefaults(scene) {
    return new Promise(function(resolve, reject) {
        loadFile(defaultFile, {scene: scene}).then(function(result){
            resolve(result.tests);
        });
    });
}

// make sure tests are ready, fill in any gaps
function prepTests() {
    // clear stored images
    images = {};
    // copy required properties from one test if undefined in the other
    return new Promise(function(resolve, reject) {
        if ((typeof slots.slot1.tests == 'undefined' || slots.slot1.tests.length === 0) && (typeof slots.slot2.tests == 'undefined' || slots.slot2.tests.length === 0)) {
            diffSay('No views defined in either test file, using default views in <a href="'+defaultFile+'">'+defaultFile+'</a>');
            Promise.all([
                loadDefaults(slots.slot1.url).then(function(val){
                    slots.slot1.tests = val;
                }),
                loadDefaults(slots.slot2.url).then(function(val){
                    slots.slot2.tests = val;
                })
            ]).then(function(){
                resolve();
            });
        } else if (typeof slots.slot1.tests == 'undefined' || slots.slot1.tests.length === 0) {
            diffSay('Using views in '+slots.slot2.file+'.');
            slots.slot1.tests = copyTestsFrom(slots.slot2.tests);
            resolve();
        } else if (typeof slots.slot2.tests == 'undefined' || slots.slot2.tests.length === 0) {
            diffSay('Using views in '+slots.slot1.file+'.');
            slots.slot2.tests = copyTestsFrom(slots.slot1.tests);
            resolve();
        } else {
            resolve();
        }
    }).then(function(){
        // convert any coordinates to locations
        for (var s in slots) {
            for (var t in slots[s].tests) {
                var test = slots[s].tests[t];
                if (typeof test.coordinate != 'undefined') {
                    test.location = parseCoordinate(test.coordinate)
                    delete test.coordinate;
                }
            }
        }
        return;
    }).then(function(){
        // count tests
        if (slots.slot1.tests.length != slots.slot2.tests.length) {
            numTests = Math.min(slots.slot1.tests.length, slots.slot2.tests.length);

            diffSay("Note: The two tests have a different number of views.");
        } else {
            numTests = slots.slot1.tests.length;
        }
        return;
    });
}

// setup output divs and canvases, and wire up connections to differ code
function prepPage() {
    if (typeof frame1.window.scene == 'undefined') {
        throw new Error("Frame 1 failed to load, check library url: \""+library1.value+"\"");
    }
    if (typeof frame2.window.scene == 'undefined') {
        throw new Error("Frame 2 failed to load, check library url: \""+library2.value+"\"");
    }
    // disable Tangram animation effects
    [frame1, frame2].forEach(function(frame) {
        frame.window.Tangram.debug.debugSettings.suppress_label_fade_in = true;
        frame.window.Tangram.debug.debugSettings.suppress_label_snap_animation = true;
    });
    // subscribe to Tangram's published view_complete event
    frame1.window.scene.subscribe({
        // trigger promise resolution
        view_complete: function () {
                // console.log('frame1 view_complete triggered');
                // call a function which resolves a promise
                viewComplete1Resolve();
            },
        warning: function(e) {
            console.log('frame1 scene warning:', e);
            }
    });
    frame2.window.scene.subscribe({
        view_complete: function () {
                // console.log('frame2 view_complete triggered');
                // call a function which resolves a promise
                viewComplete2Resolve();
            },
        warning: function(e) {
            console.log('frame2 scene warning:', e);
            }
    });
    // reset view_complete triggers if the frames are still loading
    if (frame1.window.scene.initialized !== true) {
        resetViewComplete(frame1);
        resetViewComplete(frame2);
    }

    // set status message
    var msg = "Now diffing: <a href='"+slots.slot1.originalurl+"'>"+slots.slot1.file+"</a> vs. <a href='"+slots.slot2.originalurl+"'>"+slots.slot2.file+"</a><br>" + numTests + " tests:<br>";
    get('statustext').innerHTML = msg;

    // make diffing canvas
    if (typeof diffCanvas != 'undefined') return; // if it already exists, skip the rest
    diffCanvas = document.createElement('canvas');
    diffCanvas.height = size;
    diffCanvas.width = size;
    diffCtx = diffCanvas.getContext('2d');
    diffData = diffCtx.createImageData(size, size);

}





//
// test functions
//


// parse a location in a varity of formats and return a standardized [lon, lat, z]
function parseLocation(loc) {
    if (Object.prototype.toString.call(loc) === '[object Array]') {
        return loc; // no parsing needed
    } else if (typeof(loc) === "string") {
        // parse string location as array of floats
      var location;
        if (loc.indexOf(',') > 0 ) { // comma-delimited
            // expect format: "lon,lat,z"
            location = loc.split(/[ ,]+/);
        } else if (loc.indexOf('/') > 0 ) { // slash-delimited
            // expect format: "z/lon/lat"
            location = loc.split(/[\/]+/);
            location = [location[1], location[2], location[0]]; // re-order
        }
        try {
            location = location.map(parseFloat);
        } catch(e) {
            // console.warn("Can't parse location:", loc);
            throw new Error("Can't parse location:", ''+loc);
        }
        // return updated location
        return location;
    } else {
        console.warn("Can't parse location:", ''+loc);
    }
}

// parse a tile coordinate and return a standardized [lon, lat, z]
// tile coordinates: [z, x, y]
function parseCoordinate(coord) {
    var location, coordinate;
    // expect format: "z/lon/lat" or "z,lon,lat"
    if (typeof(coord) === "string") {
        if (coord.indexOf(',') > 0 ) { // comma-delimited
            coordinate = coord.split(/[ ,]+/);
        } else if (coord.indexOf('/') > 0 ) { // slash-delimited
            coordinate = coord.split(/[\/]+/);
        }
    } else {
        coordinate = coord.slice();
    }
    try {
        coordinate = coordinate.map(parseFloat);
        location = [tile2lat(coordinate[2], coordinate[0]), tile2long(coordinate[1], coordinate[0]), coordinate[0]]
        location = location.map(parseFloat);
    } catch(e) {
        throw new Error("Can't parse coordinate:", ''+coord, e);
    }
    console.log('Coordinate:', coord, '=', location)
    // return updated location
    return location;
}

// convert tile coordinates to latlon
function tile2long(x,z) { return ((x+.5)/Math.pow(2,z)*360-180); }
function tile2lat(y,z) {
   var n=Math.PI-2*Math.PI*(y+.5)/Math.pow(2,z);
   return (180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))));
}

// load an image from a file
function loadImage (url) {
    if (typeof url == 'undefined') {
        return new Promise(function(resolve, reject) {reject();});
    }
    // console.log('loadImage:', url);
    return new Promise(function(resolve, reject) {
        // if (typeof url == "undefined") {
        //     return reject("image url undefined");
        // }
        var image = new Image();
        // set up events
        image.onload = function(r) {
            return resolve(this);
        };
        image.onerror = function(e) {
            return reject(url);
        };
        image.crossOrigin = 'anonymous';
        url = convertGithub(url);
        // force-refresh any local images with a cache-buster
        if (url.slice(-4) == imgType) url += "?" + String(new Date().getTime()).slice(-5);
        // try to load the image
        image.src = url;
    }).catch(function(error){
            // console.warn("couldn't load image: "+error);
            throw error;
        });
}

// get image data object using a canvas
function imageData (img, canvas) {
    return new Promise(function(resolve, reject) {
        var context = canvas.getContext("2d");
        // prep the canvas - prevent pixelmatch alpha bug
        context.clearRect(0, 0, canvas.width, canvas.height);
        // draw image to the canvas
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
}

// capture the current tangram map
function screenshot (save, name, frame) {
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
}

// use Tangram's view_complete event to resolve a promise
var viewComplete1, viewComplete1Resolve, viewComplete1Reject;
var viewComplete2, viewComplete2Resolve, viewComplete2Reject;

// reset the triggers on the viewComplete events to wait for the next ones
function resetViewComplete(frame) {
    if (frame.iframe.id == "map1") {
        viewComplete1 = new Promise(function(resolve, reject){
            viewComplete1Resolve = function(){
                resolve();
            };
            viewComplete1Reject = function(e){
                reject();
            };
        });
    } else if (frame.iframe.id == "map2") {
        viewComplete2 = new Promise(function(resolve, reject){
            viewComplete2Resolve = function(){
                resolve();
            };
            viewComplete2Reject = function(e){
                reject();
            };
        });
    }
}

var api_key = 'DtiDR_SqTwOtflSZielr2Q'; // nextzen tile key (dedicated for Differ use)

// load a map position and zoom
function loadView (view, location, frame) {
    return new Promise(function(resolve, reject) {
        if (!view) reject('no view');
        // if (!view.url) reject('no view url');
        // if (!view.location) reject('no view location');
        // load and draw scene
        var url = convertGithub(view.url);
        // reset the view_complete triggers
        resetViewComplete(frame);
        var scene = frame.window.scene;
        var map = frame.window.map;
        scene.last_valid_config_source = null; // overriding a Tangram fail-safe

        // ensure there's an api key
        scene.subscribe({
            load(event) {
                // Modify the scene config object here. This mutates the original scene
                // config object directly and will not be returned. Tangram does not expect
                // the object to be passed back, and will render with the mutated object.
                injectAPIKey(event.config, api_key);

                // Force animation off for consistent testing
                if (typeof event.config.scene != 'undefined') event.config.scene.animated = false;

                // unsubscribe so it doesn't keep doing this
                // may also need to be more specific about "scene"
                scene.unsubscribe(this);
            }

        });

        return scene.load(url).then(function(r) {
            map.setView([location[0], location[1]], location[2], { animate: false});
            // scene.requestRedraw(); // necessary? guess not

            // set timeout timer in case something hangs
            var timeout = setTimeout(function() {
                diffSay(view.name+": timed out.");
                console.log(view.name+": timed out");
                resolve("timeout");
            }, 6000);

            // wait for map to finish drawing, then return
            if (frame.iframe.id == "map1") {
                return viewComplete1.then(function(){
                    // reset timeout
                    clearTimeout(timeout);
                    resolve();
                }).catch(function(error) {
                    clearTimeout(timeout);
                    console.log('map1 scene load error');
                    reject(error);
                });
            } else if (frame.iframe.id == "map2") {
                return viewComplete2.then(function(){
                    // reset timeout
                    clearTimeout(timeout);
                    resolve();
                }).catch(function(error) {
                    clearTimeout(timeout);
                    console.log('map2 scene load error');
                    reject(error);
                });
            }
        }).catch(function(error) {
            // console.log('scene.load() error:', error)
            reject(error);
        });
    });
}

// if url is a schemeless alphanumeric string, add a scheme
function ensureScheme(url) {
    if (/[a-z]+/.test(url)) {
        if (url.search(/^(http|https|data|blob):/) === -1) url = window.location.protocol + "//" + url;
    }
    return url;
}

// go time
function goClick() {
    startTime = new Date().getTime();
    // console.clear();
    // reset progress bar
    updateProgress(numTests);

    get('alert').innerHTML = '';
    diffSay("Starting Diff.");
    get("goButton").blur();

    // reset iframe promises
    frame1Ready = new Promise(function(resolve, reject) {
        frame1Loaded = resolve;
    });
    frame2Ready = new Promise(function(resolve, reject) {
        frame2Loaded = resolve;
    });

    // check for schemes
    library1.value = ensureScheme(library1.value);
    library2.value = ensureScheme(library2.value);
    slot1.value = ensureScheme(slot1.value);
    slot2.value = ensureScheme(slot2.value);

    updateURL();

    // reload iframes with specified versions of Tangram
    frame1.iframe.src = "map.html?url="+library1.value;
    frame2.iframe.src = "map.html?url="+library2.value;

    var buttonloc = get("goButton").offsetTop;
    document.body.style.height = window.innerHeight + buttonloc - 50 + "px";
    // scroll to stop button
    scrollToY(getHeight() - window.innerHeight);

    // clear out any existing tests
    tests.innerHTML = "";
    data = null;
    metadata = null;
    var slot1Val = slot1.value, slot2Val = slot2.value;
    //  make master list of tests for each slot, to be used in case of recursive jsons
    slot1tests = {tests: []};
    slot2tests = {tests: []};
    // if one slot is empty, assume the value of the other
    if (slot1.value === "" && slot2.value !== "") slot1Val = slot2.value;
    if (slot2.value === "" && slot1.value !== "") slot2Val = slot1.value;
    // load any files in the file inputs and parse their contents
    return Promise.all([loadFile(slot1Val, {useImages: useImages1.checked, depth: slot1depth, tests: slot1tests}), loadFile(slot2Val, {useImages: useImages2.checked, depth: slot2depth, tests: slot2tests}), frame1Ready, frame2Ready]).then(function(result){
        slots.slot1 = result[0];
        slots.slot2 = result[1];

        // removes nulls
        function cleanArray(actual) {
          var newArray = [];
          for (var i = 0; i < actual.length; i++) {
            if (actual[i]) {
              newArray.push(actual[i]);
            }
          }
          return newArray;
        }

        function sortByKey(array, key) {
            return array.sort(function(a, b) {
                var x = a[key]; var y = b[key];
                return ((x < y) ? -1 : ((x > y) ? 1 : 0));
            });
        }

        // copy tests from the master lists and clean up
        slots.slot1.tests = JSON.parse(JSON.stringify(cleanArray(slot1tests.tests)));
        slots.slot2.tests = JSON.parse(JSON.stringify(cleanArray(slot2tests.tests)));
        // sort to ensure test order matches between slots
        slots.slot1.tests = sortByKey(slots.slot1.tests, "name");
        slots.slot2.tests = sortByKey(slots.slot2.tests, "name");

        get("goButton").setAttribute("style","display:none");
        get("stopButton").setAttribute("style","display:inline");
        get("stopButtonTop").setAttribute("style","display:inline");

        proceed();
    }).catch(function(err){
        if (typeof err != "undefined") {
          console.log(err);
          diffSay(err);
        }
        stopClick();
    });

}

// stop button
function stopClick() {
    get("stopButton").blur();
    stop();
}

// all stop
function stop() {
    if (!running) return;
    running = false;
    diffSay("Stopping Diff.");
    if (typeof slots.slot1 != "undefined") slots.slot1.tests = [];
    if (typeof slots.slot2 != "undefined") slots.slot2.tests = [];
    get("stopButton").setAttribute("style","display:none");
    get("stopButtonTop").setAttribute("style","display:none");
    get("goButton").setAttribute("style","display:inline");
}





//
// perform the test
//

function proceed() {
    running = true;
    // load the map iframes
    return Promise.all([prepMap(frame1), prepMap(frame2)]).then(function() {
        prepTests().then(function() {
            return prepPage();
        }).then(function() {
            //  wait for the maps to finish drawing
            return Promise.all([viewComplete1, viewComplete2]);
        }).then(function() {
            // load next test in each list
            var test1 = slots.slot1.tests.shift();
            var test2 = slots.slot2.tests.shift();

            prepTestImages(test1, test2);
        }).catch(function(err) {
            console.log('proceed()', err);
            diffSay(err);
            stopClick();
        });
    });
}

// prep an image to send to the differ
function prepImage(test, frame, msg) {
    return new Promise(function(resolve, reject) {

        // if there's an image for the test, load it
        loadImage(test.imageURL).then(function(result){
            diffSay(test.name+imgType+" found for "+test.file);
            // store it
            test.img = result;
            imageData(result, diffCanvas).then(function(result){
                // then return the data object
                return resolve(test.data = result.data);
            }).catch(function(err){
                console.log("> imageData err:", err);
            });
        }).catch(function(err) {

            // no image? load the test view in the map and make a new image
            try {
                var loc = parseLocation(test.location);
            } catch(e) {
                reject(e);
            }
            loadView(test, loc, frame).then(function(result){
                if (result == "timeout") {
                    test.timeout = true;
                }
                // grab a screenshot and store it
                screenshot(writeScreenshots, name, frame).then(function(result){
                    test.img = result;
                    // then return the data object
                    imageData(result, diffCanvas).then(function(result){
                        test.data = result.data;
                        return resolve(test);
                    }).catch(function(error){
                        console.log('imageData error:', error);
                        resolve(error);
                    });
                }).catch(function(error){
                    console.log('screenshot error:', error);
                    diffSay(test.name+': screenshot failed');
                    resolve(error);
                });
            }).catch(function(error){
                // console.log('loadView error:', error);
                // diffSay("couldn't load "+test.name+" in "+splitURL(test.url).file+": "+error);
                reject(error);
            });
        });
    }).catch(function(error){
        // console.log('prepImage error:', error);
        throw error;
    });
}

// prep scene file urls
function prepStyles(test1, test2) {
    return new Promise(function(resolve, reject) {
        // if there's no test scene, check for a default scene
        if (typeof test1.url == 'undefined') {
            if (typeof slots.slot1.defaultScene != 'undefined') {
                test1.url = slots.slot1.defaultScene;
            }
        }
        if (typeof test2.url == 'undefined') {
            if (typeof slots.slot2.defaultScene != 'undefined') {
                test2.url = slots.slot2.defaultScene;
            }
        }
        // if there's still no test scene for either test, check the other one
        var url = setEither(test1.url, test2.url);
        if (url === null) {
            url = setEither(slots.slot1.defaultScene, slots.slot2.defaultScene);
        }
        // if there's still no test scene, bail
        if (url === null) {
            diffSay("No scenefile URLs found for either test!");
            stopClick();
            return;
        } else {
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

// pick a location for each map to load
function prepLocations(test1, test2) {
    return new Promise(function(resolve, reject) {
        var location = setEither(test1.location, test2.location);
        if (location !== null) {
            test1.location = location[0];
            test2.location = location[1];
            return resolve({'loc1': test1.location, 'loc2': test2.location});
        } else {
            diffSay("No locations set for either test - using default location.");
            location = [40.70532700869127,-74.00976419448854,16];
            return resolve({'loc1': location, 'loc2': location});
        }
    });
}

// load or create the test images and advance the tests
function prepTestImages(test1, test2) {

    // TODO: determine whether these if blocks are necessary
    if (typeof test1 == 'undefined' && typeof test2 == 'undefined' ) {
        diffSay("No tests defined in either file.");
        stopClick();
        return false;
    }
    if (typeof test1 == "undefined" || typeof test2 == "undefined" ) {
        // stop();
        diffSay("Missing test, stopping.");
        return stop();
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

    // wait until the styles and locations have been chosen,
    Promise.all([p1, p2])
    .then(function() {
        // then load the maps and extract screengrabs from both
        return Promise.all([prepImage(test1, frame1, 1), prepImage(test2, frame2, 2)])
            .then(function() {
                // then do the diff and advance to the next test
                doDiff(test1, test2).then(nextDiff);
            }).catch(function(err) {
                console.log(err);
                diffSay(err);
                diffSay('Skipping '+test1.name+"…")
                // skip to the next test
                nextDiff();
            })
    });

    function nextDiff() {
        // update progressbar
        updateProgress(slots.slot1.tests.length);

        // if there are more tests to run
        if (slots.slot1.tests.length > 0) {
            // load next test in the lists
            test1 = slots.slot1.tests.shift();
            test2 = slots.slot2.tests.shift();
            prepTestImages(test1, test2);
        } else {
            // all done
            stop();
            console.log("Done!\n\n");
            var s = (new Date().getTime() - startTime)/1000;
            var humanTime = (s-(s%=60))/60+(9<s?'m ':':0')+s+'s';
            var msg = "<a href='"+slots.slot1.originalurl+"'>"+slots.slot1.file+"</a> vs. <a href='"+slots.slot2.originalurl+"'>"+slots.slot2.file+"</a><br>" + numTests + " test"+ (numTests == 1 ? "" : "s") + ": Done!<br>"+humanTime;
            diffSay(msg);
            get('statustext').innerHTML = "";

            var scrollTrack = checkscroll();

            // add a "done" notice at the bottom of the page as a parting gift
            // (if it doesn't already exist)
            if (document.getElementById('donediv') === null) {
                var doneDiv = document.createElement('div');
                doneDiv.id = 'donediv';
                doneDiv.innerHTML = '<a class="done" href="#" onclick="scrollToY(0, 25000)"><H2>Done! 🎉</H2><br><center>'+humanTime+'</center></a>';
                doneDiv.className = 'test';
                get('tests').appendChild(doneDiv);
            }
            flashDone();
            if (scrollTrack) {
                // scroll to bottom
                scrollToY(getHeight());
            }
        }
    }

}

// perform the image comparison and update the html
function doDiff( test1, test2 ) {
    return new Promise(function(resolve, reject) {
        var match, matchScore;
        if (test1.data && test2.data) {
            // run the diff
            var difference;
            try {
                difference = pixelmatch(test1.data, test2.data, diffData.data, size, size, {threshold: 0.05});
            } catch(e) {
                throw new Error("> diff error:", e);
            }
            // calculate match percentage
            match = 100-(difference/(lsize*lsize)*100*100)/100;
            matchScore = Math.floor(match);
            // put the diff in its canvas
            diffCtx.putImageData(diffData, 0, 0);
        } else {
            // generating new image
            match = 100;
            matchScore = "";
        }

        // update master percentage
        scores[test1.name] = match;
        var totalSum = 0;
        for (var v in scores) {
            totalSum += scores[v];
        }
        // totalScore = Math.floor(totalSum/(100*count)*100);
        // var threatLevel = totalScore > 99 ? "green" : totalScore > 98 ? "orange" : "red";
        // get('totalScore').innerHTML = "<span class='matchScore' style='color:"+threatLevel+"'>"+totalScore+"% match</span>";

        // make an output row
        makeRow(test1, test2, matchScore).then(function() {
            // store the images
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
                resolve();
            };
            diff2.src = linkFromBlob( blob );
        });
    });
}

// re-run a single test
function refresh(test1, test2) {
    // move tests to top of tests queue
    slots.slot1.tests.unshift(test1);
    slots.slot2.tests.unshift(test2);
    if (!running) {
        numTests = 1;
        return Promise.all([viewComplete1, viewComplete2]).then(function() {
            test1 = slots.slot1.tests.shift();
            test2 = slots.slot2.tests.shift();
            prepTestImages(test1, test2);
        });
    }
}

function getHeight() {
    var body = document.body;
    var html = document.documentElement;
    var height = Math.max( body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight );
    return height;
}

function checkscroll() {
    if ((window.innerHeight + window.scrollY) >= getHeight() - 200) {
        return getHeight();
    } else {
        return false;
    }
}

// create an output row in html from the map images
function makeRow(test1, test2, matchScore) {
    return new Promise(function(resolve, reject) {
        // check to see if div already exists (if re-running a test);
        var testdiv = get(test1.name);
        var scrollTrack = false;

        // check if scroll is currently at bottom of page
        if( checkscroll() ) {
            scrollTrack = true;
        }

        // if a row for this test doesn't already exist:
        if (testdiv === null) {
            // generate one
            testdiv = document.createElement('div');
            testdiv.className = 'test';
            if (typeof test1.name == 'undefined') {
                test1.name = 'undefined'+(numTests-slots.slot1.tests.length);
            }
            testdiv.id = test1.name;
            get('tests').appendChild(testdiv);
            testdiv.test1 = test1;
            testdiv.test2 = test2;
            fillDiv();
        } else {
            // clear it out
            testdiv.innerHTML = "<span class='titletext'></span><br><small></small><br><span style='height:"+size+"px; display:block'></span>";
            // wait a fraction of a second before filling, to show an update
            setTimeout(fillDiv, 50);
        }
        function fillDiv() {
            testdiv.innerHTML = "";
            var title = document.createElement('div');
            title.className = 'testname';
            // make test title a link to a live version of the test
            // parse locations
            var loc = parseLocation(test1.location);
            var frameURL = "http://tangrams.github.io/tangram-frame/";
            // make links
            var test1link = frameURL + "?url=" + test1.url + "&lib=" + library1.value + "#" + loc[2] + "/" + loc[0] + "/" + loc[1];
            var test2link = frameURL + "?url=" + test2.url + "&lib=" + library2.value + "#" + loc[2] + "/" + loc[0] + "/" + loc[1];
            title.innerHTML = "<span class='titletext'>"+test1.name+"</span> <small>"+test1.location+"</small>";
            testdiv.appendChild(title);

            var column1 = document.createElement('span');
            column1.className = 'column';
            column1.id = "column1";
            column1.innerHTML = "<a target='_blank' href='"+test1.url+"'>"+splitURL(test1.url).file+"</a><br>";

            // add an emoji overlay if the test times out
            if (test1.timeout) {
                var timer1 = document.createElement('div');
                timer1.className = 'timeout';
                timer1.innerHTML = "<a target='_blank' href='"+test1.url+"'>🚫</a>";
                column1.appendChild(timer1);
                test1.timeout = false;
            }
            testdiv.appendChild(column1);

            var column2 = document.createElement('span');
            column2.className = 'column';
            column2.id = "column2";
            column2.innerHTML = "<a target='_blank' href='"+test2.url+"'>"+splitURL(test2.url).file+"</a><br>";

            // add an emoji overlay if the test times out
            if (test2.timeout) {
                var timer2 = document.createElement('div');
                timer2.className = 'timeout';
                timer2.innerHTML = "<a target='_blank' href='"+test2.url+"'>🚫</a>";
                column2.appendChild(timer2);
                test2.timeout = false;
            }
            testdiv.appendChild(column2);

            var diffcolumn = document.createElement('span');
            diffcolumn.className = 'column';
            diffcolumn.id = "diff";
            diffcolumn.innerHTML = "diff<br>";
            testdiv.appendChild(diffcolumn);

            // insert images
            try {
                test1.img.width = size;
                test1.img.height = size;
                var a1 = document.createElement('a');
                a1.href = test1link;
                a1.target = "_blank";
                column1.appendChild( a1 );
                a1.appendChild( test1.img );
            } catch(e) {}

            try {
                test2.img.width = size;
                test2.img.height = size;
                var a2 = document.createElement('a');
                a2.href = test2link;
                a2.target = "_blank";
                column2.appendChild( a2 );
                a2.appendChild( test2.img );
            } catch(e) {}

            if (scrollTrack) {
                scrollToY(getHeight() - window.innerHeight, 3000);
            }

            // CONTROLS //

            var controls = document.createElement('span');
            controls.className = 'column';
            controls.id = 'controls';
            testdiv.appendChild(controls);

            var threatLevel = matchScore > 99 ? "green" : matchScore > 95 ? "orange" : "red";

            // console.log('matchScore?', matchScore);
            if (matchScore !== "") {
                matchScore += "% match";
                diffImg = document.createElement('img');
                diffImg.src = diffCanvas.toDataURL("image/png");
                diffImg.width = size;
                diffImg.height = size;
                diffcolumn.appendChild( diffImg );
                // clear the diff canvas
                diffCtx.clearRect(0, 0, diffCanvas.width, diffCanvas.height);
            }

            // controls.innerHTML = "<div class='matchScore' style='color:"+threatLevel+"'>"+matchScore+"</div><br>";

            var refreshButton =  document.createElement('button');
            refreshButton.innerHTML = "refresh";
            refreshButton.onclick = function() {refresh(test1, test2);};
            refreshButton.id = "refresh" + tests.children.length;
            controls.appendChild(refreshButton);

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

            resolve();
        }
    });
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

// save all new images to disk
function saveImages() {
    diffSay("Saving "+Object.keys(images).length+" images…");
    for (var name in images) {
        console.log('saving', name);
        var link = images[name].img2.src;
        blobFromLink(link, name).then(function(response){
            saveImage(response.blob, response.name);
        });
    }
    diffSay(" Done.<br>");
}

// make a png strip out of the two maps and their diff
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

// assemble a gif from the two maps using gif.js https://github.com/jnordberg/gif.js
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

// assemble all png strips into one big file, for saving, sharing, reference, etc
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
        };
        img.src = images[x].strip;
        i++;
    }
}

// create a json file with information about the current test
function makeInfoJSON() {
    var j = {};
    j.origin = {
        "useragent": navigator.userAgent,
        "devicePixelRatio": window.devicePixelRatio,
        "time": loadTime
    };
    try {
        j.tests = {};
        for (var test in data.tests) {
            j.tests[test] = {};
            for (var key in data.tests[test]) {
                if (key != "data") {
                    j.tests[test][key] = data.tests[test][key];
                }
            }
        }
    } catch(error) {
        throw error;
        return false;
    }
    saveData(j, 'differ-' + (+new Date()) + '.json');
}

// create and 'download' a new file
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


// API key enforcement

// regex to detect a nextzen url
var URL_PATTERN = /((https?:)?\/\/tile?.nextzen.org([a-z]|[A-Z]|[0-9]|\/|\{|\}|\.|\||:)+(topojson|geojson|mvt|png|tif|gz))/;

function injectAPIKey(config, apiKey) {
    var didInjectKey = false;

    Object.keys(config.sources).forEach((key) => {

        var value = config.sources[key];
        var valid = false;

        // Only operate on the URL if it's a Nextzen-hosted vector tile service
        if (!value.url.match(URL_PATTERN)) return;

        // Check for valid API keys in the source.
        // First, check theurl_params.api_key field
        // Tangram.js compatibility note: Tangram >= v0.11.7 fires the `load`
        // event after `global` property substitution, so we don't need to manually
        // check global properties here.
        if (value.url_params && value.url_params.api_key) {
            valid = true;
        // Next, check if there is an api_key param in the query string
        } else if (value.url.match(/(\?|&)api_key=[-a-z]+-[0-9a-zA-Z_-]{7}/)) {
            valid = true;
        }

        if (!valid) {
            // Add a default API key as a url_params setting.
            // Preserve existing url_params if present.
            var params = Object.assign({}, config.sources[key].url_params, {
                api_key: apiKey,
            });

            // Mutate the original on purpose.
            // eslint-disable-next-line no-param-reassign
            config.sources[key].url_params = params;
            didInjectKey = true;
        }
    });

    return didInjectKey;
}

// when the page first loads:
window.onload = function() {
    // check the url for interesting facts
    parseQuery();
    // show the top progress bar if not scrolled to the top
    var myScrollFunc = function() {
        var y = window.scrollY;
        if (y >= get('progressbar').offsetTop) {
            progressTop.style.visibility = "visible";
        } else {
            progressTop.style.visibility = "hidden";
        }
    };
    window.addEventListener("scroll", myScrollFunc);
};


//
// whew
//
