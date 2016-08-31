// A utility to draw two Tangram maps and compare them.
// Uses Vladimir Agafonkin's pixelmatch: https://github.com/mapbox/pixelmatch
// (c) 2016 Peter Richardson, MIT license

// "use strict";
/*jslint browser: true*/
/*global Tangram, gui */




//
// initialize variables
//
var mypromise;
var slots = {},
    diffImg = new Image(), diffData, diffCanvas, diffCtx,
    images = {},
    slot1depth = {val: 0},
    slot2depth = {val: 0};
    slot1tests = {tests: {}},
    slot2tests = {tests: {}};
var testsFile = "";
var queryFile = "";
var imgType = ".png";
var size = 250; // physical pixels
var lsize = size * window.devicePixelRatio; // logical pixels
var numTests, scores = [], totalScore = 0;
var data, metadata;
var loadTime = Date();
var writeScreenshots = false; // write new map images to disk?
var defaultFile = "tests/default3.json";

// shortcuts to elements
function get(id) {
    return document.getElementById(id);
}
var slot1 = get("slot1");
var slot2 = get("slot2");
var library1 = get("library1");
var library2 = get("library2");
var checkbox1 = get("checkbox1");
var checkbox2 = get("checkbox2");

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

// two iframes to hold maps
var frame1 = {
    'iframe': get("map1"),
    'window': get("map1").contentWindow,
    'document': get("map1").contentDocument
}
var frame2 = {
    'iframe': get("map2"),
    'window': get("map2").contentWindow,
    'document': get("map2").contentDocument
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

function parseQuery() {
    // test or yaml file
    var url = getQueryVariable("1")
    if (url != "") {
        slot1.value = url;
    }
    url = getQueryVariable("2")
    if (url != "") {
        slot2.value = url;
    }
    // tangram version
    var lib = getQueryVariable("lib1")
    if (lib != "") {
        library1.value = lib;
    }
    lib = getQueryVariable("lib2")
    if (lib != "") {
        library2.value = lib;
    }
    // ignore prerendered images checkbox
    var check = getQueryVariable("ignore1")
    if (check) {
        checkbox1.checked = true;
    }
    check = getQueryVariable("ignore2")
    if (check) {
        checkbox2.checked = true;
    }
    // start immediately
    url = getQueryVariable("go")
    if (url != "") {
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

function parseURL(url) {
    var parser = document.createElement('a');
    parser.href = url;
    console.log('parser:', parser);
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
    }
    rawFile.send(null);
}

function updateURL() {
    var parser = document.createElement('a');
    parser.href = window.location;
    var url = parser.pathname+"?1="+escape(slot1.value)+"&2="+escape(slot2.value)+"&lib1="+escape(library1.value)+"&lib2="+escape(library2.value)+(checkbox1.checked ? "&ignore1" : "")+(checkbox2.checked ? "&ignore2" : "")+"&go";
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

// flash background color {
function flashDone () {
    for (var x = 1; x < 11; x++) {
        setColorDelay(x);
    }
}

function setColorDelay(x) {
    var stepms = 40;
    setTimeout(function() {
        var c = 255 - 255 / x;
        var color = rgbToHex(parseInt(c), 255, parseInt(c))
        document.body.style.background = color;
    }, x * stepms)
    setTimeout(function() {
        document.body.style.background = 'white';
    }, stepms * 11);
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

// main function
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
    var time = Math.max(.1, Math.min(Math.abs(scrollY - scrollTargetY) / speed, .8));

    // easing equations from https://github.com/danro/easing-js/blob/master/easing.js
    var PI_D2 = Math.PI / 2,
        easingEquations = {
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
            // console.log('scroll done');
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
        frame.style.height = size+"px";
        frame.style.width = size+"px";

        // not sure why the others hit a race condition but this doesn't ಠ_ಠ
        var map = frame.contentDocument.getElementById("map");
        // var map = which['document'].getElementById("map");
        // var map = which.document.getElementById("map");
        map.style.height = size+"px";
        map.style.width = size+"px";

        resolve(mapWindow.map);
    }); 
}

// parse url and load the appropriate file, then create tests
function loadFile(url, ignoreImages, depth, tests) {
    // debugger;
    console.log('\n> LOADFILE:', url, 'depth:', depth.val, 'tests:', JSON.stringify(tests.tests))
    // console.log('slot1tests:', JSON.stringify(slot1tests));
    // console.log('slot2tests:', JSON.stringify(slot2tests));

    // increment depth value
    depth.val++;
    return new Promise(function(resolve, reject) {
        if (url == "") {
            throw new Error("Empty slot.");
            reject();
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
        // console.log('loadFile: typeof tests?', typeof tests);
        if (typeof tests.tests === 'undefined') tests.tests = [];

        if (urlext == "yaml") {
            slot.defaultScene = url;
            // decrement depth value
            depth.val--;
            if (depth.val == 0) {
                console.log('resolving with a yaml')
                resolve(slot);
            }
        } else if (urlext == "json") {
        // load and parse test json
            try {
                readTextFile(url, function(text){
                    console.log(' readTextFile success', url)
                    try {
                        data = JSON.parse(text);
                    } catch(e) {
                        console.warn('Error parsing json:', e);
                        // set page title
                        diffSay("Can't parse JSON: <a href='"+url+"'>"+urlname+"</a><br>"+e);
                        return false;
                    }

                    // extract test origin metadata
                    try {
                        metadata = data.origin;
                    } catch (e) {
                        diffSay("Can't parse JSON metadata: <a href='"+url+"'>"+urlname+"</a>");
                        console.warn('metadata problem, continuing', e);
                    }
                    if (typeof tests.tests != 'undefined') {
                        console.log(' readTextFile: tests?', tests.tests.length);
                    }

                    // convert tests to an array for easier traversal
                    var newTests = Object.keys(data.tests).map(function (key) {

                        // console.log('  newTests map: data.tests['+key+']:', data.tests[key]);

                        // if the test url is a json, load it recursively
                        if (data.tests[key].url.split('.').pop() == "json"){
                            // console.log('json');

                            if (typeof tests != 'undefined') {
                                // console.log('  newTests map: tests:', tests.length);
                            }
                            console.log('  newtests map: loading recursively')
                            loadFile(data.tests[key].url, ignoreImages, depth, tests).then(function(result) {
                                // console.log('loadFile', urlname, 'result:', result);
                                // console.log('  result tests:', result.tests);

                                // return result.tests;
                                // return;
                            });
                        } else {
                            // add test's name as a property of the test
                            data.tests[key].name = key;
                            // if checkbox isn't checked
                            if (!ignoreImages) {
                                // add name of pre-rendered image to look for
                                data.tests[key].imageURL = slot.dir + data.tests[key].name + imgType;
                            }
                            // console.log('data.tests['+key+']: ', data.tests[key])
                            return data.tests[key];
                        }
                    });

                    // merge tests
                    // console.log('newTests: typeof tests:', typeof tests)
                    // console.log('newTests: typeof newTests:', typeof newTests)
                    // console.log('> merging:', urlname)
                    // console.log('newTests: tests:', tests.tests, urlname)
                    // console.log('newTests: newTests:', newTests, urlname)
                    // tests += newTests;
                    for (var test in newTests) { tests.tests[test] = newTests[test]; }
                    // console.log('newTests: typeof merged tests:', typeof tests.tests)
                    depth.val--;
                    console.log('depth?', depth);
                    if (depth.val == 0) {
                        console.log('\n< RESOLVING', urlname, 'slot:', slot);
                        console.log('slot1tests:', JSON.stringify(slot1tests));
                        console.log('slot2tests:', JSON.stringify(slot2tests));
                        console.log('DONE slot:', slot)
                        slot.tests = tests.tests;
                        // resolve(slot);
                    } else {
                        console.log('-- still going, no resolution', urlname)
                    }
                    resolve(slot);

                }, function(error) {
                    console.log('promise plorbem:', error)
                    reject(error);
                });
            } catch (err) {
                if (typeof err == 'undefined') {
                    err = "File load failed.";
                } else {
                    console.log('whups', err);
                }
            };
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

function loadDefaults() {
    return new Promise(function(resolve, reject) {
        console.log('loadDefaults:', defaultFile)
        loadFile(defaultFile).then(function(result){
            console.log('loadDefaults', result)
            resolve(result.tests);
        });
    });
}

// make sure tests are ready, fill in any gaps
function prepTests() {
    // clear stored images
    images = {};
    console.log('preptests, slots:', slots)
    // copy required properties from one test if undefined in the other
    return new Promise(function(resolve, reject) {
        if ((typeof slots.slot1.tests == 'undefined' || slots.slot1.tests.length == 0)
         && (typeof slots.slot2.tests == 'undefined' || slots.slot2.tests.length == 0)) {
            diffSay('No views defined in either test file, using default views in <a href src="'+defaultFile+'">'+defaultFile+'</a>');
            Promise.all([
                loadDefaults().then(function(val){
                    console.log('val?', val)
                    slots.slot1.tests = val;
                }),
                loadDefaults().then(function(val){
                    slots.slot2.tests = val;
                })
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
function prepPage() {
    // subscribe to Tangram's published view_complete event
    frame1.window.scene.subscribe({
        // trigger promise resolution
        view_complete: function () {
                // console.log('frame1 view_complete triggered');
                viewComplete1Resolve();
            },
        warning: function(e) {
            // console.log('frame1 scene warning:', e);
            }
    });
    frame2.window.scene.subscribe({
        // trigger promise resolution
        view_complete: function () {
                // console.log('frame2 view_complete triggered');
                viewComplete2Resolve();
            },
        warning: function(e) {
            // console.log('frame2 scene warning:', e);
            }
    });

    // reset view_complete triggers if the frames are still loading
    if (frame1.window.scene.initialized != true) {
        resetViewComplete(frame1);
        resetViewComplete(frame2);
    }

    // set status message
    var msg = "Now diffing: <a href='"+slots.slot1.url+"'>"+slots.slot1.file+"</a> vs. <a href='"+slots.slot2.url+"'>"+slots.slot2.file+"</a><br>" + numTests + " tests:<br>";
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
    if (typeof url == 'undefined') {
        return new Promise(function(resolve, reject) {reject()});
    };
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
};

// use Tangram's view_complete event to resolve a promise
var viewComplete1Resolve, viewComplete1Reject;
var viewComplete1;
var viewComplete2Resolve, viewComplete2Reject;
var viewComplete2;

function resetViewComplete(frame) {
    if (frame.iframe.id == "map1") {
        viewComplete1 = new Promise(function(resolve, reject){
            viewComplete1Resolve = function(){
                // console.log('viewComplete1Resolve()');
                resolve();
            };
            viewComplete1Reject = function(e){
                reject();
            };
        });
    } else if (frame.iframe.id == "map2") {
        viewComplete2 = new Promise(function(resolve, reject){
            viewComplete2Resolve = function(){
                // console.log('viewComplete2Resolve()');
                resolve();
            };
            viewComplete2Reject = function(e){
                reject();
            };
        });
    }
}

// load a map position and zoom
function loadView (view, location, frame) {
    // console.log('loadView');
    var t = 0;
    return new Promise(function(resolve, reject) {
        if (!view) reject('no view');
        // if (!view.url) reject('no view url');
        // if (!view.location) reject('no view location');
        // load and draw scene
        var url = convertGithub(view.url);
        var name = splitURL(url).file;
        // if it's drawing, wait for it to finish
        resetViewComplete(frame);
        var scene = frame.window.scene;
        var map = frame.window.map;
        scene.last_valid_config_source = null; // overriding a Tangram fail-safe
        return scene.load(url).then(function(r) {
            // console.log('scene.load result:', r)
            scene.animated = false;
            map.setView([location[0], location[1]], location[2], { animate: false});
            // scene.requestRedraw(); // necessary? guess not

            // set timeout timer in case something hangs
            var timeout = setTimeout(function() {
                diffSay(view.name+": timed out.");
                console.log(view.name+": timed out");
                resolve("timeout");
            }, 6000);

            // wait for map to finish drawing, then return
            // todo: make this less fugly
            if (frame.iframe.id == "map1") {
                return viewComplete1.then(function(){
                    clearTimeout(timeout);
                    // console.log('map1 complete')
                    // resolve("loadview resolve");
                    resolve();
                }).catch(function(error) {
                    clearTimeout(timeout);
                    console.log('map1 scene load error')
                    reject(error);
                });
            } else if (frame.iframe.id == "map2") {
                return viewComplete2.then(function(){
                    clearTimeout(timeout);
                    // console.log('map2 complete')
                    // resolve("loadview resolve");
                    resolve();
                }).catch(function(error) {
                    clearTimeout(timeout);
                    console.log('map2 scene load error')
                    reject(error);
                });
            }
        }).catch(function(error) {
            // console.log('scene.load() error:', error)
            reject(error);
        });
    });
}

function goClick() {
    console.clear();
    // reset progress bar
    updateProgress(numTests);

    get('alert').innerHTML = '';
    diffSay("Starting Diff");
    updateURL();
    get("goButton").blur();

    // reset iframe promises
    frame1Ready = new Promise(function(resolve, reject) {
        frame1Loaded = resolve;
    });
    frame2Ready = new Promise(function(resolve, reject) {
        frame2Loaded = resolve;
    });
    // reload iframes with specified versions of Tangram
    if (safari) {
        map1.location = "map.html?url="+library1.value;
        map2.location = "map.html?url="+library2.value;
    } else {
        map1.src = "map.html?url="+library1.value;
        map2.src = "map.html?url="+library2.value;
    }
    var buttonloc = get("goButton").offsetTop;
    document.body.style.height = window.innerHeight + buttonloc - 50 + "px";
    // scroll to stop button
    scrollToY(getHeight() - window.innerHeight);

    // clear out any existing tests
    tests.innerHTML = "";
    data = null;
    metadata = null;
    var slot1Val = slot1.value, slot2Val = slot2.value;
    // if one slot is empty, assume the value of the other
    if (slot1.value == "" && slot2.value != "") slot1Val = slot2.value;
    if (slot2.value == "" && slot1.value != "") slot2Val = slot1.value;

    // mypromise = Promise.all([loadFile(slot1Val, checkbox1.checked, slot1depth, slot1tests), frame1Ready, frame2Ready]);

    // var promises = [loadFile(slot1Val, checkbox1.checked, slot1depth, slot1tests), frame1Ready, frame2Ready];
    // filepromise = promises[0];
    // mypromise = Promise.all(promises);

    mypromise = Promise.all([loadFile(slot1Val, checkbox1.checked, slot1depth, slot1tests), loadFile(slot2Val, checkbox2.checked, slot2depth, slot2tests), frame1Ready, frame2Ready]);

    return mypromise.then(function(result){
        console.log('\nREADY', result);
        // slots.slot1 = result[0];
        // slots.slot2 = result[1];
        console.log('slot1tests', slot1tests)
        console.log('slot2tests', slot2tests)
        slots.slot1 = result[0];
        slots.slot2 = result[1];
        slots.slot1.tests = slot1tests.tests;
        slots.slot2.tests = slot2tests.tests;
        get("goButton").setAttribute("style","display:none");
        get('stopButton').setAttribute("style","display:inline");
        proceed();
    }).catch(function(err){
        if (typeof err != 'undefined') {
            console.log(err);
            diffSay(err);
        }
        stopClick();
    });

    // return Promise.all([loadFile(slot1Val, checkbox1.checked, slot1depth, slot1tests), loadFile(slot2Val, checkbox2.checked, slot2depth, slot2tests), frame1Ready, frame2Ready]).then(function(result){
    //   console.log('\nREADY');
    //   slots.slot1 = result[0];
    //   slots.slot2 = result[1];
    //   get("goButton").setAttribute("style","display:none");
    //   get('stopButton').setAttribute("style","display:inline");
    //   proceed();
    // }).catch(function(err){
    //   if (typeof err != 'undefined') {
    //     console.log(err);
    //     diffSay(err);
    //   }
    //   stopClick();
    // });

}

function stopClick() {
    get('stopButton').blur();
    diffSay("Stopping Diff.");
    stop();
}


function stop() {
    if (typeof slots.slot1 != 'undefined') slots.slot1.tests = [];
    if (typeof slots.slot2 != 'undefined') slots.slot2.tests = [];
    get('stopButton').setAttribute("style","display:none");
    get("goButton").setAttribute("style","display:inline");
}






//
// perform the test
//

function proceed() {
    console.log('proceed')
            console.log('slots:',slots)
    return Promise.all([prepMap(frame1), prepMap(frame2)]).then(function() {
        prepTests().then(function() {
            return prepPage();
        }).then(function() {
            return Promise.all([viewComplete1, viewComplete2]);
        }).then(function() {
            console.log('proceed: typeof slot1.tests:', typeof slots.slot1.tests)
            console.log('proceed: slot1.tests.length:', slots.slot1.tests.length)
            console.log('proceed: slot2.tests.length:', slots.slot2.tests.length)
            console.log('proceed slot1.tests:', toString(slots.slot1.tests));
            // load next test in the lists
            test1 = slots.slot1.tests.shift();
            test2 = slots.slot2.tests.shift();
            prepTestImages(test1, test2);
        }).catch(function(err) {
            console.log('proceed ?', err);
        });
    });
}

// prep an image to send to the diff
function prepImage(test, frame, msg) {
    return new Promise(function(resolve, reject) {
        // if there's an image for the test, load it
        loadImage(test.imageURL).then(function(result){
            diffSay(test.name+imgType+" found for "+test.file)
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
            var loc = parseLocation(test.location);
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
                        // throw new Error(error);
                    });
                }).catch(function(error){
                    console.log('screenshot error:', error);
                    diffSay(test.name+': screenshot failed')
                    // throw new Error(error);
                    resolve(error)
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
        var url = setEither(test1.url, test2.url);
        if (url == null) {
            url = setEither(slots.slot1.defaultScene, slots.slot2.defaultScene);
        }
        if (url == null) {
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

// load or create the test images and advance the tests
function prepTestImages(test1, test2) {
    if (typeof test1 == 'undefined' && typeof test2 == 'undefined' ) {
        diffSay("No tests defined in either file.");
        stopClick();
        return false;
    }

    function nextDiff() {
        try {
            doDiff(test1, test2);
        } catch(e) {
            console.log('doDiff failed:', e.stack);
        }
        if (slots.slot1.tests.length > 0) {
            // load next test in the lists
            test1 = slots.slot1.tests.shift();
            test2 = slots.slot2.tests.shift();
            prepTestImages(test1, test2);
        } else {
            stop();
            console.log("Done!");
            var msg = "<a href='"+slots.slot1.url+"'>"+slots.slot1.file+"</a> vs. <a href='"+slots.slot2.url+"'>"+slots.slot2.file+"</a><br>" + numTests + " test"+ (numTests == 1 ? "" : "s") + ": Done!";
            diffSay(msg);
            get('statustext').innerHTML = "";

            var doneDiv = document.createElement('div');
            doneDiv.innerHTML = '<a class="done" href="#" onclick="scrollToY(0, 25000)"><H2>Done! 🎉</H2></a>';
            doneDiv.className = 'test';
            get('tests').appendChild(doneDiv);
            flashDone();
            if (checkscroll()) {
                scrollToY(getHeight());
            }
        }
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

    Promise.all([p1, p2])
    .then(function() {
        return Promise.all([prepImage(test1, frame1, 1), prepImage(test2, frame2, 2)])
            .then(function() {
                nextDiff();
            }).catch(function(err) {
                console.log(err);
                diffSay(err);
            });
    });

}

// perform the image comparison and update the html
function doDiff( test1, test2 ) {
    if (test1.data && test2.data) {
        // run the diff
        try {
            var difference = pixelmatch(test1.data, test2.data, diffData.data, size, size, {threshold: 0.05});
        } catch(e) {
            throw new Error("> diff error:", e);
        }
        // calculate match percentage
        var match = 100-(difference/(lsize*lsize)*100*100)/100;
        var matchScore = Math.floor(match);
        // put the diff in its canvas
        diffCtx.putImageData(diffData, 0, 0);
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
    // get('totalScore').innerHTML = "<span class='matchScore' style='color:"+threatLevel+"'>"+totalScore+"% match</span>";

    // make an output row
    makeRow(test1, test2, matchScore);
    // store the images
    images[test1.name] = {};
    images[test1.name].img1 = test1.img;
    images[test1.name].img2 = test2.img;

    // console.log('diffImg?', diffImg);
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

    // clear the diff canvas
    diffCtx.clearRect(0, 0, diffCanvas.width, diffCanvas.height);
};

function refresh(test1, test2) {
    // console.log('refresh:', test)
    slots.slot1.tests.push(test1);
    slots.slot2.tests.push(test2);
    numTests = Math.min(slots.slot1.tests.length, slots.slot2.tests.length);
    return Promise.all([viewComplete1, viewComplete2]).then(function() {
        prepTestImages(test1, test2);
    });
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

function makeRow(test1, test2, matchScore) {
    // console.log('makeRow:', test1, test2);
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
        var testdiv = document.createElement('div');
        testdiv.className = 'test';
        if (typeof test1.name == 'undefined') {
            test1.name = 'undefined'+(numTests-slots.slot1.tests.length);
        }
        testdiv.id = test1.name;
        get('tests').appendChild(testdiv);
        testdiv.test1 = test1;
        testdiv.test2 = test2;
    } else {
        // clear it out
        testdiv.innerHTML = "";
    }
    var title = document.createElement('div');
    title.className = 'testname';
    // make test title a link to a live version of the test

    // parse locations
    var loc = parseLocation(test1.location);
    // make links
    var test1link = "http://tangrams.github.io/tangram-frame/?url="+convertGithub(test1.url)
        +"&lib="+library1.value
        +"#"+loc[2]+"/"+loc[0]+"/"+loc[1];
    var test2link = "http://tangrams.github.io/tangram-frame/?url="+convertGithub(test2.url)
        +"&lib="+library2.value
        +"#"+loc[2]+"/"+loc[0]+"/"+loc[1];
    title.innerHTML = "<span class='titletext'>"+test1.name+"</span> <small>"+test1.location+"</small>";
    testdiv.appendChild(title);

    var column1 = document.createElement('span');
    column1.className = 'column';
    column1.id = "column1";
    column1.innerHTML = "<a target='_blank' href='"+test1.url+"'>"+splitURL(test1.url).file+"</a><br>";

    if (test1.timeout) {
        var timer = document.createElement('div');
        timer.className = 'timeout';
        timer.innerHTML = "<a target='_blank' href='"+test1.url+"'>🚫</a>";
        column1.appendChild(timer);
    }
    testdiv.appendChild(column1);

    var column2 = document.createElement('span');
    column2.className = 'column';
    column2.id = "column2";
    column2.innerHTML = "<a target='_blank' href='"+test2.url+"'>"+splitURL(test2.url).file+"</a><br>";

    if (test2.timeout) {
        var timer = document.createElement('div');
        timer.className = 'timeout';
        timer.innerHTML = "<a target='_blank' href='"+test2.url+"'>🚫</a>";
        column2.appendChild(timer);
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
        var a = document.createElement('a');
        a.href = test1link;
        a.target = "_blank";
        column1.appendChild( a );
        a.appendChild( test1.img );
    } catch(e) {}
    
    try {
        test2.img.width = size;
        test2.img.height = size;
        var a = document.createElement('a');
        a.href = test2link;
        a.target = "_blank";
        column2.appendChild( a );
        a.appendChild( test2.img );
    } catch(e) {}

    if (scrollTrack) {
        scrollToY(getHeight() - window.innerHeight, 3000);
    }

    // CONTROLS //

    var controls = document.createElement('span');
    controls.className = 'controls';
    testdiv.appendChild(controls);

    var threatLevel = matchScore > 99 ? "green" : matchScore > 95 ? "orange" : "red";

    // console.log('matchScore?', matchScore);
    if (matchScore != "") {
        matchScore += "% match";
        diffImg = document.createElement('img');
        diffImg.src = diffCanvas.toDataURL("image/png");
        diffImg.width = size;
        diffImg.height = size;
        diffcolumn.appendChild( diffImg );
    }

    // controls.innerHTML = "<div class='matchScore' style='color:"+threatLevel+"'>"+matchScore+"</div><br>";

    var refreshButton =  document.createElement('button');
    refreshButton.innerHTML = "refresh";
    refreshButton.onclick = function() {refresh(test1, test2);}
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
    // console.log('makeStrip images:', images);
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
        j.tests = {};
        for (test in data.tests) {
            j.tests[test] = {};
            for (key in data.tests[test]) {
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

    var myScrollFunc = function() {
        var y = window.scrollY;
        if (y >= get('progressbar').offsetTop) {
        progressTop.style['visibility'] = "visible";
        } else {
        progressTop.style['visibility'] = "hidden";
        }
    };

    window.addEventListener("scroll", myScrollFunc);

}
