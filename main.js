/*jslint browser: true*/
/*global Tangram, gui */

map = (function () {
    'use strict';

    var map_start_location = [40.70531887544228, -74.00976419448853, 15]; // NYC

    /*** URL parsing ***/

    // leaflet-style URL hash pattern:
    // #[zoom],[lat],[lng]
    var url_hash = window.location.hash.slice(1, window.location.hash.length).split('/');

    if (url_hash.length == 3) {
        map_start_location = [url_hash[1],url_hash[2], url_hash[0]];
        // convert from strings
        map_start_location = map_start_location.map(Number);
    }

    /*** Map ***/

    var map = L.map('map',
        {"keyboardZoomOffset" : .05}
    );

    var layer = Tangram.leafletLayer({
        scene: 'scene.yaml',
        attribution: '<a href="https://mapzen.com/tangram" target="_blank">Tangram</a> | &copy; OSM contributors | <a href="https://mapzen.com/" target="_blank">Mapzen</a>',
        postUpdate: postUpdate
    });

    window.layer = layer;
    var scene = layer.scene;
    window.scene = scene;

    // setView expects format ([lat, long], zoom)
    map.setView(map_start_location.slice(0, 3), map_start_location[2]);

    var hash = new L.Hash(map);


    /***** Render loop *****/

    window.addEventListener('load', function () {
        // Scene initialized
        layer.on('init', function() {
        });
        layer.addTo(map);
    });
    
    window.queue_screenshot = false;

    // Post-render hook
    function postUpdate () {
        // Screenshot needs to happen in the requestAnimationFrame callback, or the frame buffer might already be cleared
        if (queue_screenshot == true) {
            queue_screenshot = false;
            screenshot();
        }
    }

    return map;

}());

// Take a screenshot and save file
function screenshot() {
    // Adapted from: https://gist.github.com/unconed/4370822
    var image = scene.canvas.toDataURL('image/png').slice(22); // slice strips host/mimetype/etc.
    var data = atob(image); // convert base64 to binary without UTF-8 mangling
    var buf = new Uint8Array(data.length);
    for (var i = 0; i < data.length; ++i) {
        buf[i] = data.charCodeAt(i);
    }
    var blob = new Blob([buf], { type: 'image/png' });
    saveAs(blob, 'tangram-' + (+new Date()) + '.png'); // uses FileSaver.js: https://github.com/eligrey/FileSaver.js/
}

setTimeout(function() {
    queue_screenshot = true;
    scene.requestRedraw();
}, 1000);

