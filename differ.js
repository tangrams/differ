"use strict";
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
var tests = document.getElementById("tests");
var statusDiv = document.getElementById("statustext");
var progressBar = document.getElementById("progressbar");
var alertDiv = document.getElementById("alert");
var totalScoreDiv = document.getElementById("totalScore");
var goButton = document.getElementById("goButton");
var stopButton = document.getElementById("stopButton");
var localButton = document.getElementById("localButton");
var saveButton = document.getElementById("saveButton");
var data, metadata;
var loadTime = Date();
var writeScreenshots = false; // write new map images to disk?

if (window.location.hostname != "localhost" ) saveButton.setAttribute("style", "display:none");



//
// helper functions
//

// useragent.innerHTML = "useragent: "+navigator.userAgent+"<br>Device pixel ratio: "+window.devicePixelRatio;

// parse URL to check for test json passed in the query
// eg: http://localhost:8080/?test.json
// function parseQuery() {
//     var url = window.location.search.slice(1, window.location.search.length);
//     if (url != "") {
//         return convertGithub(url);
//     }
//     else return testsFile;
// }

// add text to the output div
function diffSay(txt) {
    alertDiv.innerHTML += txt;
    alertDiv.scrollTop = alertDiv.scrollHeight;
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

// testsFile = parseQuery();

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

function prepMap() {
    return new Promise(function(resolve, reject) {
        // set sizes
        document.getElementById("map").style.height = size+"px";
        document.getElementById("map").style.width = size+"px";

        // initialize Tangram
        /*** Map ***/
        if (typeof window.map == "undefined") {

            var map = L.map('map', {
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

// parse url and load the appropriate file
function loadFile(slotID) {
    return new Promise(function(resolve, reject) {
        var slot = document.getElementById(slotID);
        var url = slot.value;
        var local = false;
        if (url == "a local build") {
            local = true;
            url = slot1.value;
        }
        url = convertGithub(url);
        var urlname = splitURL(url).file;
        var urlext = splitURL(url).ext;
        var style = "";

        // populate slots array
        slots[slotID] = {};
        slots[slotID].url = url;
        slots[slotID].file = urlname;

        if (urlext == "yaml") {
            style = url.slice(0);
            url = "tests/default.json"
        }

        // load and parse test json
        readTextFile(url, function(text){
            if (url == "") return false;
            try {
                data = JSON.parse(text);
            } catch(e) {
                console.warn('Error parsing json:', e);
                // set page title
                alertDiv.innerHTML += "Can't parse JSON: <a href='"+url+"'>"+urlname+"</a><br>"+e+"<br>";
                return false;
            }

            // extract test origin metadata
            try {
                metadata = data.origin;
            } catch (e) {
                alertDiv.innerHTML += "Can't parse JSON metadata: <a href='"+url+"'>"+urlname+"</a><br>";
                console.warn('metadata problem, continuing', e);
            }
            // convert tests to an array for easier traversal
            slots[slotID].tests = Object.keys(data.tests).map(function (key) {
                // add test's name as a property of the test
                data.tests[key].name = key;
                if (urlext == "yaml") {
                    data.tests[key].url = style;
                } else if (local) {
                    data.tests[key].imageURL = null;
                } else {
                    // add name of pre-rendered image to look for
                    data.tests[key].imageURL = splitURL(slots[slotID].url).dir + data.tests[key].name + imgType;
                }

                return data.tests[key];
            });

            resolve();
        });
    }).catch(function(err) {
            console.log('problem?', err);
    });
}

function localBuild() {
    var slot2 = document.getElementById('slot2')
    slot2.value = "a local build";        
}

// setup output divs and canvases
function prepPage() {

    // reset progress bar
    updateProgress(numTests);
    // clear stored images
    images = {};
    // clone views array
    var tests1 = slots.slot1.tests.slice(0);
    var tests2 = slots.slot2.tests.slice(0);

    // subscribe to Tangram's published view_complete event
    scene.subscribe({
        // trigger promise resolution
        view_complete: function () {
                viewCompleteResolve();
            }
    });

    // clear messages
    alertDiv.innerHTML = "";
    // clear out any existing tests
    tests.innerHTML = "";
    // count tests
    numTests = slots.slot1.tests.length;
    // set status message
    var msg = "Now diffing: <a href='"+slots.slot1.url+"'>"+slots.slot1.file+"</a> vs. ";
    msg += (slot2.value == "a local build") ? "a local build" : "<a href='"+slots.slot2.url+"'>"+slots.slot2.file+"</a>";
    msg += "<br>" + numTests + " tests:<br>";
    statusDiv.innerHTML = msg;

    // make canvas
    if (typeof canvas != 'undefined') return; // if it already exists, skip the rest
    canvas = document.createElement('canvas');
    canvas.height = lsize;
    canvas.width = lsize;
    ctx = canvas.getContext('2d');
    diff = ctx.createImageData(lsize, lsize);

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
    return new Promise(function(resolve, reject) {
        if (typeof url == "undefined") {
            return reject("undefined url");
        }
        var image = new Image();
        // set up events
        image.onload = function() {
            resolve(image);
        };
        image.onerror = function(e) {
            return reject("couldn't load image");
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
        var data = context.getImageData(0, 0, lsize, lsize);
        resolve(data);
    }, function(err) {
        console.warn('imageData err:', err);
        data = null;
        reject(data);
    });
};

// capture the current tangram map
function screenshot (save, name) {
    return scene.screenshot().then(function(data) {
        // save it to a file
        if (save) saveImage(data.blob, name);

        return loadImage(linkFromBlob( data.blob ));
    }).catch(function(err){
        console.warn('screenshot fail:', err);
        return Promise.reject();
    });
};

// use Tangram's view_complete event to resolve a promise
var viewCompleteResolve, viewCompleteReject;
var viewComplete;
function resetViewComplete() {
    console.log("> resetting viewComplete");
    viewComplete = new Promise(function(resolve, reject){
        viewCompleteResolve = function(){
            resolve();
        };
        viewCompleteReject = function(e){
            console.log("> viewComplete FAIL");
            reject();
        };
    });
}

// load a map position and zoom
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
        return scene.load(url).then(function() {
            scene.animated = false;
            map.setView([location[0], location[1]], location[2]);
            // scene.requestRedraw(); // necessary?
            // wait for map to finish drawing, then return
            return viewComplete.then(function(){
                return resolve();
            });
        }).catch(function(error){
            console.log('> scene load error:', error)
            return reject('scene.load error');
        });
    }).catch(function(error){
        console.log('> loadview promise error:', error)
        throw new Error("loadview throws promise error!", error);
        // return("loadview throws promise error!", error);
    });
}

function goClick() {
    goButton.blur();
    Promise.all([loadFile('slot1'),loadFile('slot2')]).then(function(){
        goButton.setAttribute("style","display:none");
        stopButton.setAttribute("style","display:inline");
        proceed();
    }).catch(function(err){
        diffSay("Load two files<br>");
        diffSay(err);
    });
}

function stopClick() {
    stopButton.blur();
    diffSay("Stopping test!<br>");
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
    return prepMap().then(function(val) {
        map = val;
        prepPage();
        prepBothImages();
    });
}

// prep an image to send to the diff
function prepImage(test) {
    return new Promise(function(resolve, reject) {
        // if there's an image for the test, load it
        return loadImage(test.imageURL).then(function(result){
            diffSay(test.name+imgType+" found; ")
            // store it
            test.img = result;
            return imageData(result, canvas).then(function(result){
                // then return the the data object
                return resolve(test.data = result.data);
            }).catch(function(err){
                console.log("> imageData err:", err);
            });
        }).catch(function(err) {
            console.log('loadImage err?', err);
        // no image? load the test view in the map and make a new image
            var loc = parseLocation(test.location);
            return loadView(test, loc).then(function(result){
                console.log('loadView result:', result);
                // grab a screenshot and store it
                return screenshot(writeScreenshots, test.name).then(function(result){
                    // console.log('screenshot result:', result);
                    test.img = result;

                    // then return the data object
                    return imageData(result, canvas).then(function(result){
                        // console.log('imageData result:', result);
                        // diffSay(test.name+" mapped; ")
                        return resolve(test.data = result.data);
                    }).catch(function(error){
                        console.log('imageData error:', error);
                        throw new Error(error);
                    });
                });
            }).catch(function(error){
                console.log('loadView error:', error);
                // throw new Error(error);
                return reject(error);
            });
        }).catch(function(error){
            console.log('loadImage error:', error);
            // throw new Error(error);
            return reject(error);
        });
    });
}
// load or create the test images
function prepBothImages() {
    // load next test in the lists
    var test1 = slots.slot1.tests.shift();
    var test2 = slots.slot2.tests.shift();
    // console.log('test1:', test1);
    // console.log('test2:', test2);
    if (typeof test1 == "undefined" || typeof test2 == "undefined" ) {
        diffSay("Missing test in slot ");
        if (typeof test1 == "undefined") diffSay("1");
        if (typeof test2 == "undefined") diffSay("2");
        stop();
    }

    // diffSay("<br>"+test1.name+' vs. '+test2.name+": ");
    prepImage(test1)
    .catch(function(err){
        console.log('prepimage1 err:', err);
    })
    .then(prepImage(test2))
    .catch(function(err){
        console.log('prepimage2 err:', err);
    })
    .then(function(result){
        doDiff(test1, test2);
        console.log("more?");
        if (slots.slot1.tests.length > 0) {
            console.log('> next!');
            prepBothImages();
        } else {
            stop();
            diffSay("<br>Done!<br>");
            console.log("Done!");
        }
    }).catch(function(err){
        console.log('problem:', err);
    });
}

// perform the image comparison and update the html
function doDiff( test1, test2 ) {
    // UPDATE READOUTS
    // var count = views.length-queue.length;
    // statusDiv.innerHTML = count + " of " + views.length;

    if (test1.data && test2.data) {
        // run the diff
        try {
            var difference = pixelmatch(test1.data, test2.data, diff.data, lsize, lsize, {threshold: 0.1});
            // console.log('difference:', difference);
        } catch(e) {
            console.log("> diff error:", e);
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
    // check to see if div already exists (if re-running a test);
    var testdiv = document.getElementById(test1.name);

    // if a row for this test doesn't already exist:
    if (testdiv === null) {
        // generate one
        var testdiv = document.createElement('div');
        testdiv.className = 'test';
        testdiv.id = test1.name;
        tests.insertBefore(testdiv, tests.firstChild);
    } else {
        // clear it out
        testdiv.innerHTML = "";
    }
    var title = document.createElement('div');
    title.className = 'testname';
    // make test title a link to a live version of the test"
    var testlink = "http://tangrams.github.io/tangram-frame/?url="+test1.url+"#"+test1.location[2]+"/"+test1.location[0]+"/"+test1.location[1];
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

    // insert images
    test1.img.width = size;
    test1.img.height = size;
    column1.appendChild( test1.img );
    
    test2.img.width = size;
    test2.img.height = size;
    column2.appendChild( test2.img );

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
        ctx.drawImage(images[x], size * x, 0);
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
    }
    var newJSON = JSON.stringify(j, null, 2);
    var url = 'data:text/json;charset=utf8,' + encodeURIComponent(newJSON);
    download(url, "json");
}

function download(url, type) {
    // var w = window.open(url, '_blank');
    var a = document.createElement('a');
    a.href = url;
    a.download = "differ-"+new Date().getTime()+"."+type;
    document.body.appendChild(a); // necessary for Firefox
    a.click();
    document.body.removeChild(a);
}


// loadButton1.click();
// loadButton2.click();
goButton.click();