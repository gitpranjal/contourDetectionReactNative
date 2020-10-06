/* jshint esversion: 6, browser: true, devel: true */
/* globals _:false, $:false, log:false, localStorage:false, showBusy:false, hideBusy:false, _gaq:false, addthis:false, AWS:false, SparkMD5:false */
'use strict';

if ('https:' != document.location.protocol) {
    location.href = location.href.replace(/^http:/i, 'https:');
}

function log() {
    try {
        try {
            var a = [];
            for (var i = 0; i < arguments.length; i++)
                a.push(typeof arguments[i] == 'function' ? 'function' : JSON.stringify(arguments[i]));
            console.log((new Date()).toTimeString() + ': ' + a.join(', '));
        } catch (e) {
            console.log("error logging"); // some objects always fail to encode as strings so good to still have some sign that the log is being called when print debugging
        }
        //console.log(arguments.map(JSON.stringify).join(', '))
    } catch (e) {}
}

function parseQueryString(s) {
    var re = /([^&=]+)=([^&]*)/g,
        queryParamMatch, result = {};
    while ((queryParamMatch = re.exec(s !== undefined ? s : location.search.slice(1))))
        result[decodeURIComponent(queryParamMatch[1])] = decodeURIComponent(queryParamMatch[2].replace(/\+/g, ' '));
    return result;
}
window.queryParams = parseQueryString();

var delayedCalls = {};

const pluginApi = {
    plugins: null
    // registerPlugin: options => {
    //     console.log();
    //     // const manifest = $(document.currentScript).data('pluginManifest');
    //     // $.extend(pluginApi.plugins[manifest.name] = manifest, options);
    // }
};

function delayExec(f, delay) {
    // - have optioanl arg to override key used
    try {
        clearTimeout(delayedCalls[f]);
    } catch (e) {}
    delayedCalls[f] = setTimeout(f, delay * 1000);
}

const imageAreaLimit = Math.pow(2000, 2);

function resizeImageToCanvas(img, newSize, flatten = false) {
    const canvas = document.createElement('canvas');
    canvas.width = newSize[0];
    canvas.height = newSize[1];
    const context = canvas.getContext('2d');
    if (flatten) {
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.imageSmoothingQuality = 'high'; // currently only works well when scaling down in Chrome; could use an img resizing library but can probably just wait for the other browsers to improve
    context.imageSmoothingEnabled = true;
    context.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, canvas.width, canvas.height);
    //return context.getImageData(0, 0, canvas.width, canvas.height);
    return canvas;
}

function resizeImage(img, newSize) {
    return resizeImageToCanvas(img, newSize).toDataURL();
}

function _imageCanvas(img, useNaturalSize = false, backgroundColor = undefined) {
    const canvas = document.createElement('canvas'); // apparently this doesnt add the element to the document, so it should be automatically released when this func returns
    canvas.width = useNaturalSize ? img.naturalWidth : img.width;
    canvas.height = useNaturalSize ? img.naturalHeight : img.height;
    const context = canvas.getContext('2d');
    //alert(canvas.width + ' ' + canvas.height);
    if (backgroundColor !== undefined) {
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, canvas.width, canvas.height);
    return {
        canvas: canvas,
        context: context
    };
}

function getImageData(img, useNaturalSize = false, backgroundColor = undefined) {
    return _imageCanvas(img, useNaturalSize, backgroundColor).context.getImageData(0, 0, useNaturalSize ? img.naturalWidth : img.width, useNaturalSize ? img.naturalHeight : img.height);
}

function imageToDataUrl(img) {
    return _imageCanvas(img).canvas.toDataURL();
}

function getImageFromURL(url, callback) {
    var img = new Image();
    img.onload = function() {
        callback(img);
    };
    img.onerror = function() {
        callback();
    }
    img.src = url;
    return img;
}

function getCursorPosition(canvas, event) { // gets mouse position in canvas
    // - needs to handle css scaling effect
    var canoffset = $(canvas).offset();
    var x = event.clientX + document.body.scrollLeft + document.documentElement.scrollLeft - Math.floor(canoffset.left),
        y = event.clientY + document.body.scrollTop + document.documentElement.scrollTop - Math.floor(canoffset.top) + 1;
    //var k = img.width / $(canvas).width() /* / $('#canvas').css('zoom') doesnt work in IE*/
    return [x, y];
}

function getImageColorType(imgData) {
    // returns 'rgb', 'gray', or 'bw'
    var data = imgData.data,
        limit = imgData.height * imgData.width,
        i = 0,
        bilevel = true;
    while (i < limit) {
        var r = data[i],
            g = data[i + 1],
            b = data[i + 2];
        if (r != g || r != b) {
            //log(i, r, g, b)
            return 'rgb';
        }
        if (bilevel && ((r !== 0 && r != 255) || (g !== 0 && g != 255) || (b !== 0 && b != 255)))
            bilevel = false;
        i += 4;
    }
    return bilevel ? 'bw' : 'gray';
}

function guessImgDataCropRect( /*img*/ data, threshold) {
    //var data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
    if (threshold === undefined)
        threshold = 255;

    function filled(x, y) {
        var i = (y * data.width + x) * 4;
        //return data.data[i] == 255 && data.data[i+1] == 255 && data.data[i+2] == 255
        // - use tolerance
        return data.data[i + 3] > 0 && (data.data[i] < threshold || data.data[i + 1] < threshold || data.data[i + 2] < threshold);
    }

    function getLeft() {
        for (var x = 0; x < data.width; x++)
            for (var y = 0; y < data.height; y++)
                if (filled(x, y))
                    return x;
        return 0;
    }

    function getTop() {
        for (var y = 0; y < data.height; y++)
            for (var x = 0; x < data.width; x++)
                if (filled(x, y))
                    return y;
        return 0;
    }

    function getRight() {
        for (var x = data.width - 1; x >= 0; x--)
            for (var y = 0; y < data.height; y++)
                if (filled(x, y))
                    return x;
        return data.width - 1;
    }

    function getBottom() {
        for (var y = data.height - 1; y >= 0; y--)
            for (var x = 0; x < data.width; x++)
                if (filled(x, y))
                    return y;
        return data.height - 1;
    }
    var left = getLeft(),
        top = getTop();
    return [left, top, getRight() - left + 1, getBottom() - top + 1];
}

function trackPageview(page) {
    try {
        _gaq.push(['_trackPageview', page]);
        //log('stencil pinned tracked')
    } catch (err) {}
}

function trackEvent(category, action, label=undefined, value=undefined) {
    // https://developers.google.com/analytics/devguides/collection/analyticsjs/events
    try { ga('send', 'event', category, action, label); } catch (e) {}
}

function emailURL(url, title) {
    // share a url by email using addThis so it doesnt rely on user having mailto: working
    function send() {
        if (!$('#hiddenAddThisForEmail').length)
            $('body').append('<div id=hiddenAddThisForEmail class="addthis_toolbox" style="display: none;"><a class="addthis_button_email"></a></div>');
        $('#hiddenAddThisForEmail').attr({
            'addthis:url': url,
            'addthis:title': title
        });
        addthis.toolbox('#hiddenAddThisForEmail');
        $('#hiddenAddThisForEmail a.addthis_button_email').click();
    }
    if ($('script[src*=addthis]').length)
        send();
    else
        $.getScript('//s7.addthis.com/js/300/addthis_widget.js#pubid=ra-5283fff054c6e692').done(function() {
            setTimeout(send, 500); // give the script a chance to execute
        });
}

var repeatTimeout, repeatDelay;

function repeatMouseDown(sel, delay, k) {
    // ? could add limit option: Math.max(repeatDelay, minDelay)
    repeatTimeout = null; // tolerable to be global since you can only click on one thing at a time anyway
    $(sel).mousedown(function() {
        var e = $(this);
        repeatDelay = (delay || 0.5) * 1000;

        function repeat() {
            //log('clicking')
            e.click();
            repeatTimeout = setTimeout(repeat, repeatDelay *= (k || 0.66));
        }
        repeat();
    }).on('mouseup mouseout', function() {
        if (repeatTimeout) {
            //log('stopped')
            clearTimeout(repeatTimeout);
            repeatTimeout = null;
        }
    });
}

function showMessage(s, fade) {
    // shows a message prominently and then fades it out after a few seconds, instead of using alert() box that users has to laboriously click to close
    const e = $('<div id=fadingMessageDiv/>');
    if ($ && !$.fn.center) { // should really just center using css
        $.fn.center = function() {
            this.css("position", "absolute");
            this.css("top", Math.max(0, (($(window).height() - $(this).outerHeight()) / 2) +
                $(window).scrollTop()) + "px");
            this.css("left", Math.max(0, (($(window).width() - $(this).outerWidth()) / 2) +
                $(window).scrollLeft()) + "px");
            return this;
        };
    }
    e.html(s).appendTo('body').center() /*.position({ my: 'center', at: 'center', of: window }) require jQuery UI*/ .hide().fadeIn();
    if (fade)
        e.delay(1500).fadeOut(undefined, function() {
            e.remove();
        });
    return e;
}

function xhrUploadProgress() {
    // for use as xhr parameter in $.ajax call; shows progress % in #uploadProgress
    var xhr = $.ajaxSettings.xhr();
    if (xhr) {
        if (xhr.upload && 'onprogress' in xhr.upload) { // xhr.upload.onprogress is always null so have to check using 'in'
            //log('add progress event')
            xhr.upload.addEventListener('progress', function(event) {
                var percent, i = event.loaded || event.position,
                    total = event.totalSize || event.total;
                if (event.lengthComputable) {
                    percent = Math.ceil(i / total * 100);
                    $('#uploadProgress').text(percent);
                }
                //log(i, total, percent)
            }, false);
        }
    }
    return xhr;
}

function checkIfUploaded(url, size, callback) {
    $.ajax({
        type: 'HEAD', // check if file already in S3 bucket and complete
        url: url,
        cache: false,
        error: function() {
            // if this request fails (403 forbidden) because the file hasn't been upload to S3 yet, you'll see a 403 error in the webbrowser console but that's ok
            //log("file not already at S3");
            callback(false);
        },
        success: function(data, status, xhr) {
            // make sure <ExposeHeader>Content-Length</ExposeHeader> is in S3 bucket CORS config
            //log("upload already in bucket");
            callback(xhr.getResponseHeader('Content-Length') == size);
        }
    });
}

function checkIfUploaded2(key, size, callback) {
    callImagingLambda({
        data: {
            exists: key,
            size: size
        },
        success: function(r) {
            callback(r.exists);
            // - should really handle errors too
        }
    });
}

function prettyUploadS3(options) {
    //const bucket = 'https://rroupload.s3.amazonaws.com/',
    const reader = new FileReader();
    if (options.control) // at least have to handle filereader.onerror or could get into state where ctrls are permanently disabled; also probably need a timeout
        $(options.control).prop('disabled', true); // disable button (given selector) so user doesnt click repeatedly
    //key = md5(options.dataURL);
    reader.onloadend = function() {
        const key = SparkMD5.ArrayBuffer.hash(reader.result); //, url = bucket + key;
        log(`upload key: ${key} ${options.blob.size}`);
        //checkIfUploaded(url, options.blob.size, function(isUploaded) {
        checkIfUploaded2(key, options.blob.size, function(isUploaded) {
            if (isUploaded) {
                if (options.control)
                    $(options.control).prop('disabled', false);
                options.success({
                    key: key
                    //url: url
                });
            } else {
                const contentType = options.blob.type || options.contentType || 'image/unknown';
                callImagingLambda({
                    data: {
                        getPutUrl: key,
                        contentType: contentType
                    },
                    success: function(r) {
                        const msg = showMessage("Uploading <span id=uploadProgress>0</span>%"); // - checkifUploaded might take a moment so should show msg before it
                        const formData = new FormData();
                        formData.append('key', key); // seems this must be first
                        formData.append('acl', 'bucket-owner-full-control'); //,public-read");
                        //formData.append('Content-Type', 'image/png');
                        //formData.append('file', new Blob([1,2,3], {type: 'image/png'}));
                        formData.append('file', options.blob); // officially must be the last field in the form
                        // the object uploaded from here seems not to ahve the expiation rule that everything in the bucket is supposed to ahve; it lacks permissions and an owner (aws) + weirdly because of the direct upload i don't have permissions to rename the s3 object, though i can delete it & the content type seems not to be set, though doesnt seem to be a problem either; it did end up deleting after nearly 2 days
                        $.ajax({
                            url: r.url, //bucket,
                            //async: false, // so window.open wont be popup blocked
                            data: options.blob, //formData,
                            contentType: contentType, //false,
                            processData: false,
                            cache: false,
                            type: 'PUT', //'POST', //async: !dontAlert, // for ajax to work from unload, must be async
                            //dataType: 'text', // not json so if server prints error i can still see it
                            complete: function() { // complete called after success
                                if (options.control)
                                    $(options.control).prop('disabled', false);
                                msg.remove();
                            },
                            error: function(xhr, status, error) {
                                if (error !== 'abort') // && $.trim(error))
                                    alert(`There was an error while uploading: ${status} ${error}\n\nPlease try again.`);
                            },
                            success: function(r) {
                                options.success({
                                    key: key
                                    //url: url
                                });
                            },
                            //timeout: 60*1000,
                            xhr: xhrUploadProgress
                        });
                    }
                });
            }
        });
    };
    reader.readAsArrayBuffer(options.blob);
}

function dataURItoBlob(dataURI) {
    const byteString = atob(dataURI.split(',')[1]),
        mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0],
        ab = new ArrayBuffer(byteString.length),
        ia = new Uint8Array(ab);

    for (let i = byteString.length - 1; i >= 0; i--)
        ia[i] = byteString.charCodeAt(i);

    return new Blob([ab], {
        type: mimeString
    });
}

if (!HTMLCanvasElement.prototype.toBlob) { // toBlob polyfill for Safari & IE
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
        value: function(callback, type, quality) {
            var binStr = atob(this.toDataURL(type, quality).split(',')[1]),
                len = binStr.length,
                arr = new Uint8Array(len);

            for (var i = 0; i < len; i++) {
                arr[i] = binStr.charCodeAt(i);
            }
            callback(new Blob([arr], {
                type: type || 'image/png'
            }));
        }
    });
}

function getSessionToken() {
    try {
        return localStorage.rapidResizerToken;
    } catch (e) {
        alert(`Error accessing localStorage. Please ensure you don't have cookies or site data blocked in your browser.\n\n${e}`);
    }
}

function logout() {
    const cookieDomain = /rapidresizer\.com$/i.test(location.hostname) ? '.rapidresizer.com' : location.hostname;
    document.cookie = 'user=; expires=Thu, 01 Jan 1970 00:00:01 GMT; domain=' + cookieDomain + '; path=/;';
    document.cookie = 'password=; expires=Thu, 01 Jan 1970 00:00:01 GMT; domain=' + cookieDomain + '; path=/;';
    document.cookie = 'email=; expires=Thu, 01 Jan 1970 00:00:01 GMT; domain=' + cookieDomain + '; path=/;';
    document.cookie = 'user=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/;'; // to clean up some accidental cookies
    document.cookie = 'password=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/;';
    document.cookie = 'email=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/;';
    document.cookie = 'lastPattern=; expires=Thu, 01 Jan 1970 00:00:01 GMT; domain=' + cookieDomain + '; path=/;';
    document.cookie = 'lastPattern=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/;';
    // the above are vestigial
    try {
        localStorage.clear();
    } catch (e) {}
}

const apiUrl = 'https://od8ipm3wxa.execute-api.us-east-1.amazonaws.com/production/uploadimage';
function callImagingLambda(options) {
    const request = {
        url: apiUrl,
        type: 'POST',
        data: options.data,
        error: function(xhr, status, error) {
            //alert((xhr.responseText || '').trim() || `Error: ${status} ${error}`);
            if (_.isFunction(options.error)) {
                options.error(xhr, status, error);
            } else if (xhr.responseText && options.error !== false) {
                if (/^Not logged in/.test(xhr.responseText)) { // - a bit lame to depend on that error message
                    logout();
                    location = '/login.php';
                } else
                    alert(xhr.responseText);
            }
        },
        success: options.success,
        complete: options.complete
    };
    const token = getSessionToken();
    if ( /*options.user &&*/ token)
        request.headers = {
            Authorization: `Bearer ${token}`
        };
    $.ajax(request);
}

function requestPasswordReset(email) {
    callImagingLambda({
        data: {
            user: 'requestResetPassword',
            email: email || _user.email
        },
        success: function (r) {
            dialogs.alert("Password Reset", r.resetEmailSentTo ? `Your password reset email has been sent to ${r.resetEmailSentTo}. It should arrive in a moment. You may need to check your spam folder or Promotions tab (if any).` : (r.errorMessage || r.errorName));
        }
    });
}

function saveImageOnline(key, callback) {
    callImagingLambda({
        data: {
            user: 'saveDesign',
            key: key
        },
        success: callback
    });
    /*
    return $.post(
        '/storeimage.php',
        {imgid: key}
        //'json'
    ); // - handle errors
    */
}

function deleteImageOnline(key) {
    callImagingLambda({
        data: {
            user: 'deleteDesign',
            key: key
        },
        //success: r => { callback(r.url); }
    });
}

function getUploadedUrl(key, callback) { // gets a temporary url to an image in the rroupload bucket
    callImagingLambda({
        data: {
            getUpload: key
        },
        success: r => {
            callback(r.url);
        }
    });
}

function Int32ToArray(n) {
    return /*new Uint8Array*/ ([
        (n & 0xff000000) >> 24,
        (n & 0x00ff0000) >> 16,
        (n & 0x0000ff00) >> 8,
        (n & 0x000000ff)
    ]);
}

var crc32 = (function() // from https://stackoverflow.com/questions/18638900/javascript-crc32
    {
        var table = new Uint32Array(256);

        for (var i = 256; i--;) {
            var tmp = i;

            for (var k = 8; k--;) {
                tmp = tmp & 1 ? 3988292384 ^ tmp >>> 1 : tmp >>> 1;
            }

            table[i] = tmp;
        }
        return function(data) {
            var crc = -1; // Begin with all bits set ( 0xffffffff )

            for (var i = 0, l = data.length; i < l; i++) {
                crc = crc >>> 8 ^ table[crc & 255 ^ data[i]];
            }

            return (crc ^ -1) >>> 0; // Apply binary NOT
        };

    })();

function createPngTextChunk(keyword, text) {
    var type, data, chunk; // length type keyword null text crc

    if (text.length >= 1024) { // 'It is recommended that text items less than 1K (1024 bytes) in size should be output using uncompressed tEXt chunks. In particular, it is recommended that the basic title and author keywords should always be output using uncompressed tEXt chunks. Lengthy disclaimers, on the other hand, are ideal candidates for zTXt.' - https://www.w3.org/TR/PNG-Encoders.html#E.Text-chunk-processing
        type = [122, 84, 88, 116]; // zTXt
        data = keyword + '\0\0' + pako.deflate(text, {
            to: 'string'
        });
    } else {
        type = [116, 69, 88, 116]; // tEXt
        data = keyword + '\0' + text;
    }
    chunk = new Uint8Array(4 + 4 + data.length + 4);
    chunk.set(Int32ToArray(data.length));
    chunk.set(type, 4);
    chunk.set((_.invoke || _.invokeMap)(data, 'charCodeAt'), 4 + 4);
    //chunk.set(_.invoke(keyword, 'charCodeAt'), 4 + 4);
    //chunk.set([0], 4 + 4 + keyword.length);
    //chunk.set(_.invoke(text, 'charCodeAt'), 4 + 4 + keyword.length + 1);
    chunk.set(Int32ToArray(crc32(chunk.subarray(4, chunk.length - 4))), chunk.length - 4); // CRC: 'including the chunk type field and chunk data fields, but not including the length field.'
    return chunk;
}

function encodePNG(canvas, textChunks, callback) {
    var dataURL = canvas.toDataURL(), // - ideally deflate canvas to PNG myself so I can get higher compression than browser's do: https://github.com/ShyykoSerhiy/canvas-png-compression/blob/master/src/PngWriter.ts
        data = atob(dataURL.split(',')[1]),
        buffer,
        byteArray,
        i,
        chunks = [],
        blob;

    _.forEach(textChunks, (v, k) => {
        chunks.push(createPngTextChunk(k, v));
    });
    buffer = new ArrayBuffer(data.length + _.reduce(chunks, function (memo, a) { return memo + a.length; }, 0));
    byteArray = new Uint8Array(buffer);
    for (i = data.length - 1; i >= 0; i--)
        byteArray[i] = data.charCodeAt(i);
    i = data.length - 12;
    byteArray.set(byteArray.subarray(i, i + 12), byteArray.length - 12); // copy png end chunk to end of extended array
    chunks.forEach(function (chunk) {
        byteArray.set(chunk, i);
        i += chunk.length;
    });
    blob = new Blob([byteArray], {type: 'image/png'});
    // - include chunks for user etc or does lambda do that? i think it does -- download raw png and see what's in it
    callback(blob);
}

function normalizeBlob(blob, callback) {
    // metadata never used; so (if not svg) just: 0 scrub files sent by users 1 check area (uploadImage already ensures size is acceptable) 2 ensure flat / no alpha (white background) 3 ensure PNG(24) opt4 compress well
    // - when to convert canvas to png using good compressor? anywhere toblob called. main cases are file on start page or canvas from app. there's toBlob here and toBlob in uploadImage for canvases. so need code to high compress canvas to png blob. actually, i don't think the browser compression is that bad. i probasbly just had that compression because i might have compared a jpg to its png version. can vary by browser though. would be nice to guarnatee maximum consistent compression.
    if ((blob.type != 'image/svg+xml') && ((blob instanceof File) || (blob.type != 'image/png'))) {
        // if file from user should remake to remove personal details or weird info; otherwise assume the blob was generated by Rapid Resizer and is pretty safe (aside from size, which I handle in uploadImage)
        log('normalizing image before upload');
        const url = URL.createObjectURL(blob);
        getImageFromURL(url, img => {
            // img.type?
            _imageCanvas(img, true, 'white').canvas.toBlob(callback); // scrurbs file, flattens transparecny to white, and converts to png24or32 (24 ideally)
            URL.revokeObjectURL(url);
        });
    } else {
        // alert(blob.type);
        // - so just ensure png (24 or 32 bit, not that any other kind is likely to occur) and ensure alpha flattened onto white. again, if coming from app, can probably assume 24/32 bit and no alpha. so just do for files.
        callback(blob);
    }
}

function uploadImage(options) { //image, success, save=false) {
    // options keys...
    // image: datauri encoded image string, blob/file of image, svg string, canvas element
    // save: stores in user's set of saved designs
    // success: func
    // normalize: if true (default) calls lambda to convert image and store on rrotmp bucket

    var blob;

    if (options.image instanceof Blob) {
        blob = options.image;
        if (!/svg/i.test(blob.type) && !options.sizeSafe) { // svg width/height doesn't matter for uploading
            const url = URL.createObjectURL(blob);
            getImageFromURL(url, img => {
                //alert(`Checking blob image size ${img.width} x ${img.height}`);
                if (img.width * img.height > imageAreaLimit) {
                    log(`Reducing image size before upload: file size changed from ${blob.size} ${img.width}x${img.height}`);
                    options.image = resizeImageToCanvas(img, proportionallyLimitArea([img.width, img.height]), true);
                    // though you're limiting size here, still need to limit size on uploading for weird SVG file or other nonsense
                }
                options.sizeSafe = true;
                uploadImage(options);
                URL.revokeObjectURL(url);
            });
            return;
        }
    } else if (/^data:/i.test(options.image)) {
        options.image = dataURItoBlob(options.image);
        return uploadImage(options);
    } else if (options.image instanceof Element && options.image.tagName.toLowerCase() == 'canvas') {
        options.image.toBlob(function(blob) {
            log(`Converted canvas to blob: blob size = ${blob.size}`);
            options.image = blob;
            return uploadImage(options);
        });
        return;
    } else { // is svg (document object or string)
        //blob = dataURItoBlob('data:image/svg+xml;base64,' + btoa(options.image));
        if ((options.image.rootElement || {}).nodeName == 'svg') {
            options.image = new XMLSerializer().serializeToString(options.image);
        }
        if (_.isString(options.image)) {
            blob = new Blob([options.image], {
                type: 'image/svg+xml'
            });
        } else {
            return; // - error
        }
    }

    const uploadOptions = {
        blob: blob,
        //control: '#saveColoring, #resize',
        success: function(r) {
            if (options.normalize) { // so now the normalize option mainly means that a 2nd lambda call is made to check if the image fits the internal requirements and, if so, copies it from the rroupload bucket to rrotmp; 2ndarily noramlize means that (now) the client works to ensure the image meets the backend standards
                const msg = showMessage('<i class="fa fa-spinner fa-pulse" style="margin-right: 0.5em;"></i> Processing image');
                const s3key = r.key; // in rroupload S3 bucket
                callImagingLambda({
                    data: {
                        s3key: s3key,
                        keepProps: options.keepProps
                        //userId: parseInt(options.userId) || 0, // not used with SVGs anyway
                        //free: /FREE/.test((window.queryParams || {}).imgid)
                    },
                    success: function(r) {
                        if (r.error || r.errorMessage)
                            alert(r.error || r.errorMessage);
                        else {
                            const key = r.s3key,
                                url = `https://${location.hostname}/resize.php?imgid=${key}`;
                            if (key) {
                                if (options.save) {
                                    saveImageOnline(key, () => { //).then(() => {
                                        if (options.success)
                                            options.success({
                                                id: key,
                                                url: url
                                            });
                                    });
                                } else {
                                    if (options.success)
                                        options.success({
                                            id: key,
                                            url: url
                                        });
                                }
                            } else
                                alert("There was a problem saving online. Please try again.");
                            //showMessage(data.id ? "Saved" : "There was a problem saving online.<p>Please try again.", true);
                        }
                    },
                    complete: function() {
                        msg.remove();
                    }
                });
            } else {
                if (options.success)
                    options.success(r);
            }
        }
    };

    if (options.normalize) {
        normalizeBlob(blob, blob => {
            uploadOptions.blob = blob;
            // window.open(URL.createObjectURL(blob));
            prettyUploadS3(uploadOptions);
        });
    } else {
        prettyUploadS3(uploadOptions);
    }
}

function getProportionallyLimitedAreaScale(size, maxArea = imageAreaLimit, enlargeToLimit = false) {
    const area = parseFloat(size[0]) * parseFloat(size[1]);
    if (area <= 0)
        return [0, 0];
    let k = Math.sqrt(maxArea / area);
    if (!enlargeToLimit)
        k = Math.min(k, 1);
    return k;
}

function proportionallyLimitArea(size, maxArea = imageAreaLimit, enlargeToLimit = false) {
    const k = getProportionallyLimitedAreaScale(size, maxArea, enlargeToLimit);
    return [k * size[0], k * size[1]].map(Math.floor); // can't use ceil because it can round to over limit
}

function shortenURL(url, f) {
    callImagingLambda({
        data: { shortenUrl: url },
        success: r => { f(r) }
    });
}

function showImageDownload(img) {
    var fileExt = 'png';
    if (img instanceof Blob) {
        if (/^image\/svg/i.test(img.type)) // - bettet to just extract type from mime string
            fileExt = 'svg';
        img = URL.createObjectURL(img); // - release it when done
    } else if (_.isString(img)) {
        if (/^data:image\/svg/i.test(img))
            fileExt = 'svg';
    } else
        return;
    // - could add sharing options too
    // apparently browsers dont yet decently support programmtically copying an img to the clipboard, so cant have a button for that yet
    //img: word stencil has svg text but can make data uri, picture stencil has canvas and can maek data uri, colorjs has canvas -- so probably just expect data uri
    const modal = $(`
<div class="modal fade collapse" id=exportDlg tabindex="-1" role="dialog">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <button type="button" class="close" data-dismiss="modal"><span aria-hidden="true">&times;</span><span class="sr-only">Close</span></button>
        <h4 class="modal-title" id="myModalLabel">Get Your Design</h4>
      </div>
      <div class="modal-body text-center">
        <p>
            <!--<button class="btn btn-default exportDlgDownload collapse">Save to Your Device</button>-->
            <a class="collapse exportDlgDownload" style="margin-right: 1em;">Save to Your Computer</a>
            <button class="btn btn-default exportDlgPrint">Print on One Page</button>
        </p>
        <p class="exportDlgInstr"><!--Right click (or tap and hold) on the image below to save it to your computer or to copy &amp; paste it.--></p>
        <img id=exportImg class="img-responsive" style="margin-top: 1em; margin-bottom: 1em; background: white;"></p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
      </div>
    </div>
  </div>
</div>`).appendTo('body');
    // - try blob urls instead of data urls? assuming that's convenient and data uris can really still be a problem when not in address bar https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL
    // - when to URL.revokeObjectURL() on the blob urls -- URL.createObjectURL(blob)
    /*
    function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}*/
    modal.on('hidden.bs.modal', function() {
        modal.remove();
    });
    //$('#exportDlgDownload').click(() => {
    //});
    if ("download" in document.createElement("a")) { // supported by all but iOS and IE (Edge does support download attribute) - http://caniuse.com/download/embed
        $('.exportDlgDownload').attr({
            href: img,
            download: `Design.${fileExt}`
        }).show();
        $('.exportDlgInstr').html(($.browser.mobile ? "Tap and hold" : "Right click") + " on the image to copy &amp; paste it.").show();
    } else
        $('.exportDlgInstr').html(($.browser.mobile ? "Tap and hold" : "Right click") + " on the image to save it to your device or to copy &amp; paste it.").show();
    $('.exportDlgPrint').click(() => {
        printImage(img);
    });
    //$('#exportDlg .fa-spinner').show();
    //_.defer(function() {
    $('#exportImg').attr('src', img); //.slideDown();
    //$('#exportDlg .fa-spinner').slideUp();
    //});
    $('#exportDlg').modal('show');
    $('#exportDlg').modal('show');
    /*
            if (navigator.msSaveBlob) { // Edge and IE won't show datauris
                svgToPngBlob(window.svg, function(blob) {
                    navigator.msSaveBlob(blob, 'Design.png');
                });
            } else if (!$.browser.mozilla && "download" in document.createElement("a")) { // missing in IE and iOS
                $('<a>').attr({download: 'Stencil.png', href: svgToPngDataUri(window.svg)})[0].click(); // didnt work in Firefox - need to add element to body
            } else {
                //location.href = $(this)[0].toDataURL(); // doesnt work in chrome/ie/edge cuz they no longer allow content navigation of top frame to datauri
                window.open(svgToPngDataUri(window.svg)); // popup blockers may interfere with this
            }
    */
}

function pdfPageSelector(pdf, callback) {
    function drawPageToCanvas(page, width, canvas, callback = undefined) {
        const viewport = page.getViewport(width / page.getViewport(1).width);
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        page.render({
            canvasContext: canvas.getContext('2d'),
            viewport: viewport
        }).then(() => {
            if (callback)
                callback(canvas);
        });
    }

    const modal = $(`
<div class="modal fade collapse" id=pdfPageSelectorDlg tabindex="-1" role="dialog">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <button type="button" class="close" data-dismiss="modal"><span aria-hidden="true">&times;</span><span class="sr-only">Close</span></button>
        <h4 class="modal-title">Choose a Page</h4>
      </div>
      <div class="modal-body text-center">
        <div class="row text-center" id=pdfPageSelectorPages>
            <i class="fa fa-3x fa-spinner fa-pulse" style="color: #13A5CE;"></i>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
      </div>
    </div>
  </div>
</div>`).appendTo('body').modal('show');
    modal.on('hidden.bs.modal', function() {
        modal.remove();
    });

    $.getScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/1.6.414/pdf.min.js', () => {
        window.PDFJS.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/1.6.414/pdf.worker.min.js'; // https://mozilla.github.io/pdf.js/api/draft/
        // PDFJS.disableWorker = true; // doesn't work when pdf.js loaded off of a CDN
        window.PDFJS.getDocument(pdf).then(function(pdf) {
            const canvasPrefix = 'pdfPageCanvas',
                template = window.Handlebars.compile(`
{{#each this}}
    <div class="pageThumbnail col-xs-12 col-sm-6 col-md-3" data-pageNumber="{{pageNumber}}">
        <canvas id="{{canvasId}}" style="cursor: pointer; border: 1px solid black;" class="img-responsive"></canvas>
        <h4>{{pageNumber}}</h4>
    </div>
{{/each}}`);
            if (pdf.pdfInfo.numPages <= 0) {
                $('#pdfPageSelectorPages').text("This PDF has no pages.");
            } else if (pdf.pdfInfo.numPages === 1) {
                modal.modal('hide');
                pdf.getPage(1).then(page => {
                    const canvas = document.createElement('canvas');
                    drawPageToCanvas(page, 1700, canvas, callback); // 1700px wide asumes letter size pages
                });
            } else {
                $('#pdfPageSelectorPages').html(template(_.times(pdf.pdfInfo.numPages, i => {
                    return {
                        canvasId: canvasPrefix + i,
                        pageNumber: i + 1
                    };
                })));
                $('#pdfPageSelectorDlg .pageThumbnail').click(function() {
                    modal.modal('hide');
                    const iPage = parseInt($(this).attr('data-pageNumber'));
                    pdf.getPage(iPage).then(page => {
                        // const canvas = document.getElementById(canvasPrefix + iPage - 1);
                        const canvas = document.createElement('canvas');
                        drawPageToCanvas(page, 1700, canvas, callback); // 1700px wide asumes letter size pages
                    });
                });
                _.times(Math.min(pdf.pdfInfo.numPages, 40), i => {
                    pdf.getPage(i + 1).then(page => {
                        drawPageToCanvas(page, 200, document.getElementById(canvasPrefix + i));
                    });
                });
            }
        }, function() {
            log('pdf page selector error', arguments);
        });
    });
}

function printImage(img) {
    window.open().document.write(`<img src="${img}" width="100%"><script>setTimeout(print, 0);</script\>`);
}

function showUserDesigns() {
    const imgWidth = 100; //, widthInPics = Math.ceil(800 / imgWidth)
    const elem = $('.userPatterns');
    var patterns = []; //, picsToAdd = 0; // - patterns[] won't yet work when there are multiple userPatterns divs in page
    const areaLimit = Math.pow(imgWidth, 2);

    function addPic( /*loadExtra=0*/ ) { //pattern) {
        //getDesign( // - idealy would have lambda generrate thumbnails with image fitted to that width -- except browsers scale down poorly so shiould use 3rd party library
        //console.log([elem.scrollLeft(), elem.width(), loadExtra, imgWidth, elem[0].scrollWidth]);
        if (!patterns.length || elem.scrollLeft() + elem.width() + imgWidth * 3 < elem[0].scrollWidth) // loads a few extra so scrolling is smooth
            return;
        const pattern = patterns.shift();
        try {
            pattern.date = (new Date(pattern.modified)).toLocaleString(undefined, {
                year: '2-digit',
                month: 'short',
                day: 'numeric'
            });
        } catch (e) {
            pattern.date = '';
        }
        if (!elem.find('table').length)
            elem.html('<table><tr></tr></table>');
        const cell = $('<td class=patternThumbnailCell><i class="fa fa-spinner fa-pulse"></i></td>').appendTo(elem.find('tr'));
        getDesignRasterizedToObjectURL(
            pattern.image_id,
            //blob => {
            url => {
                // ? won't too many of these big blobs accumulate? maybe at least shrink client side then, so you need only hold on to the thumbnail; could even just use canvases instead of img elems for the thumbnails
                if (!url /* || Math.random() > 0.5*/ ) {
                    cell.html(`<button title="Click to try reloading this thumbnail image" class="btn btn-sm btn-default reloadThumbnail" data-dbid="${pattern.image_id}">Retry<!--<i class="fa fa-refresh"></i>--></button><div>${pattern.date}</div>`);
                    cell.find('button').click(function() {
                        getDesignRasterizedToObjectURL(
                            $(this).attr('data-dbid'),
                            url => {
                                cell.html(`<img class=patternThumbnail data-dbid="${pattern.image_id}" src="${url}"><div>${pattern.date}</div>`);
                            },
                            areaLimit
                        );
                    });
                } else {
                    cell.html(`<img class=patternThumbnail data-dbid="${pattern.image_id}" src="${url}"><div>${pattern.date}</div>`);
                }
                setTimeout(function() {
                    if (elem.is(":visible"))
                        addPic();
                }, 20);
                /*getImageFromURL(url, img => {
                    log('appending design thumbnail');
                    const size = [img.width, img.height];
                    //elem.find('tr').append(template(pattern));
                    cell.html(`<img class=patternThumbnail data-dbid="${pattern.image_id}"><div>${pattern.date}</div>`);
                    const imgElem = cell.find('img')/$(elem).find('img:last')/.on('load error', function() {
                        //log('added pic', $('#patternsDiv').width(), $('#patternsDiv table').width())
                        //if (--picsToAdd > 0 && patterns.length)
                        //if (patterns.length && elem.scrollLeft() + 1.3 * elem.width() >= elem[0].scrollWidth)
                            // elem.scrollLeft(): amount row is scrolled horz in pixels
                            // elem.width: visible width of row
                            // elem[0].scrollWidth: full width of row
                            setTimeout(function() { addPic(); }, 50); // Math.max(0, loadExtra - 1)/patterns.shift()/
                            //elem.slideDown();
                    }); // .attr('src', `imagedb.php?fit=${imgWidth}&id=${pattern.image_id}`);
                    if (size[0] * size[1] > areaLimit) {
                        resizeImageToCanvas(img, proportionallyLimitArea(size, areaLimit)).toBlob(blob => {
                            imgElem.attr('src', URL.createObjectURL(blob));//URL.createObjectURL(blob));
                            URL.revokeObjectURL(url);
                        });
                    } else
                        imgElem.attr('src', url);//URL.createObjectURL(blob));
                });*/
            },
            //'blob',
            areaLimit,
            true
        );
    }
    if (getSessionToken()) {
        elem.html('<i class="fa fa-spinner fa-pulse" style="margin-right: 0.5em;"></i> Loading designs').off('scroll').attr('title', "Scroll to reveal your old designs on the right").slideDown(); // - should have another more conspicuous way to indicate this
        callImagingLambda({
            data: {
                user: 'listDesigns'
            },
            success: function(r) {
                if (r.designs && r.designs.length) {
                    elem.scroll(_.debounce(addPic, 100)); // have to debounce because of so many scroll events
                    patterns = r.designs;
                    addPic();
                    if (patterns.length > 12)
                        $('#showAllDesigns').slideDown();
                } else
                    elem.remove();
            }
        });
    } else
        elem.remove();
}

function canvgLazy() {
    const canvgArgs = arguments;
    if (canvgArgs.length == 3) {
        canvgArgs[2].ignoreMouse = true;
        canvgArgs[2].ignoreAnimation = true;
    }
    if (window.canvg) {
        canvg.apply(null, canvgArgs);
    } else {
        $.getScript("https://cdnjs.cloudflare.com/ajax/libs/canvg/1.4/rgbcolor.min.js", function() {
            //$.getScript("https://cdnjs.cloudflare.com/ajax/libs/canvg/1.4/canvg.js", function() {
            $.getScript("https://cdnjs.cloudflare.com/ajax/libs/canvg/1.4/canvg.min.js", function() {
                canvg.apply(null, canvgArgs);
            });
        });
    }
}

function rasterizeSvgToBlob(svg, callback, area) {
    // concerts svg string into an image blob
    const xml = $($.parseXML(svg)).find('svg').first();
    let fittedSvg;
    if (!area)
        area = imageAreaLimit;
    if (xml) {
        const size = [
            parseFloat(xml.attr('width')) || parseFloat(xml.attr('viewBox').split(' ')[2]),
            parseFloat(xml.attr('height')) || parseFloat(xml.attr('viewBox').split(' ')[3])
        ];
        if ((_.all || _.every)(size)) { // - ideally calc width/height if neither viewbox nor width/height
            const fittedSize = proportionallyLimitArea(size, area, true); // - ideally fit exactly inside canvas size
            if (!xml.attr('viewBox'))
                xml.attr('viewBox', `0 0 ${size[0]} ${size[1]}`);
            xml.attr('width', fittedSize[0]);
            xml.attr('height', fittedSize[1]);
            fittedSvg = new XMLSerializer().serializeToString(xml[0]);
        }
    }
    const canvas = document.createElement('canvas');
    canvgLazy(
        canvas,
        fittedSvg || svg, {
            renderCallback: function() {
                canvas.toBlob(callback);
            }
        }
    );
}

function getDesign(img_id, callback, responseType, fromSavedDesigns, fitArea = null) {
    // fitArea means shrink if larger than that size in total pixels (not width)
    callImagingLambda({
        data: {
            getDesign: img_id,
            fitArea: fitArea
        },
        //error: fitArea ? false : undefined, // bit of a hack to have callImagingLambda not alert() errors from the lambda when the last used design shown on start.php happens to no longer exist
        error: xhr => {
            if (!fitArea && /^Not logged in/.test(xhr.responseText)) { // - a bit lame to depend on that error message
                logout();
                    location = '/login.php';
            }
            callback(false);
        },
        success: function(r) {
            const url = r.url;
            if (url) {
                if (responseType == 'url') {
                    callback(url, this);
                } else {
                    // loads png/svg from server; have to load img using this instead of the src of an Image object because i want access to the svg data
                    // when that random CORS issue occurs, the call to the lambda did work and i do have a url from it, it's just that accessing that URL fails
                    const xhr = new XMLHttpRequest();
                    xhr.onload = function(e) {
                        if (this.status == 200 && this.response) { // onload will be called for 404s
                            callback(this.response, this); // blob, xhr
                            // $('.imgLoading').slideUp();
                        }
                    };
                    xhr.onerror = function(e) {
                        callback(false, false, this.status); // i think status=0 for CORs error
                        // don't really need to distinguish different errors here since if the design didn't exist, then the lambda produced a nice error messager which callImaginigLambda would have shown
                        log(`getDesign error: ${this.status} ${this.statusText}`);
                        //alert("There was an error fetching the image. Please try reloading the page."); // (on safari at least) when you leave start.php before all thumbnails loaded, it would give this error -- annoying
                    };
                    xhr.open('GET', url, true);
                    xhr.responseType = responseType || 'blob'; //'arraybuffer'; // setting this after calling open fixed this line on IE
                    xhr.send();
                }
            }
        }
    });
}

function blobToText(blob, callback) {
    const reader = new FileReader();
    reader.addEventListener('loadend', e => {
        callback(reader.result);
    });
    reader.readAsText(blob);
}

function blobToDataURL(blob, callback) {
    const reader = new FileReader();
    reader.addEventListener('loadend', e => {
        callback(reader.result);
    });
    reader.readAsDataURL(blob);
}

function getDesignRasterizedToBlob(img_id, callback, area, fromSavedDesigns) {
    // loads png/svg from server. if it's an svg, rasterizes it client-side to desired size.
    getDesign(img_id, (blob, xhr) => {
        if (!blob)
            callback(false);
        else if (/svg/i.test(xhr.getResponseHeader('Content-Type'))) {
            //svg = Uint8toString(new Uint8Array(this.response));
            /*const reader = new FileReader();
            reader.addEventListener('loadend', e => {
                rasterizeSvgToBlob(reader.result, callback, area);
            });
            reader.readAsText(blob);*/
            blobToText(blob, svg => {
                rasterizeSvgToBlob(svg, callback, area);
            });
        } else {
            callback(blob); // - isn't using area limit -- and sometimes i want fit (mainly or only for svgs) not max, can blob size be easily checked? probably not
        }
    }, undefined, fromSavedDesigns, area);
}

function getDesignRasterizedToObjectURL(img_id, callback, area, fromSavedDesigns) {
    getDesignRasterizedToBlob(img_id, blob => {
        callback(blob ? URL.createObjectURL(blob) : false);
    }, area, fromSavedDesigns);
}

function cropImageToCanvas(img, rect) {
    // rect = [x, y, w, h]
    // returns cropped Image object
    const canvas = document.createElement('canvas');
    canvas.width = rect[2];
    canvas.height = rect[3];
    const context = canvas.getContext('2d');
    context.drawImage(img, rect[0], rect[1], canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function cropImageToBlob(img, rect, callback) {
    cropImageToCanvas(img, rect).toBlob(callback);
}

const traceImageAreaLimit = Math.pow(1000 - 2, 2);//, tracingCache = {};
function traceImage(options) {
    const border = 2; // needed by tracing algorithm
    const tracePreppedCanvas = transformImage(options.image, [['limitArea', traceImageAreaLimit], ['threshold', 128], ['border', 'white', border]]);
    uploadImage({
        image: tracePreppedCanvas,
        success: function(r) {
            if (r.error) {
                alert(r); //options.complete({errorMessage: r.error});
            } else {
                const data = {
                    s3key: r.key,
                    output: options.outputFormat || 'svg',
                    type: options.traceMethod,
                    cornerThreshold: options.cornerThreshold || 128
                };
                //const cacheKey = JSON.stringify(data);
                //const cachedTracing = tracingCache[cacheKey];
                //if (cachedTracing && cachedTracing.timestamp 
                // signed url for tracing defaults to lasting 15 minutes
                callImagingLambda({
                    data: data,
                    success: function(r) {
                        if (r.error) {
                            alert(r.error);
                            //options.complete({errorMessage: r.error});
                        } else {
                            //tracingCache[cacheKey] = 
                            options.success({traceUrl: r.trace});
                        }
                    }
                });
            }
        }
    });
}

function showMaillistInterstitial(f) {
    f();
} // vestigial

var _user;

function getUser(callback) {
    if (_user)
        callback(_user);
    else if (getSessionToken()) {
        callImagingLambda({
            data: {
                user: 'getInfo'
            },
            success: function(user) {
                try {
                    user.expires_on = user.expires_on.replace(' ', 'T'); // safari needs the T in 'YYYY-MM-DDTHH-MM-SSZ'
                    user.expiresDate = new Date(user.expires_on); // Date.parse(user.expires_on.replace(' ', 'T'))
                    if (!user.hasOwnProperty('unexpired'))
                        user.unexpired = user.expiresDate.getTime() > (new Date()).getTime();
                } finally {
                    _user = user;
                    callback(_user);
                }
            }
            //error: function() { reveal(); } - should be handled
        });
    } else
        callback();
}

function runPlugin(options) {
    // options = { id, elem, input, output }
    // - show spinner when loading plugin index or individual plugin; handle errors
    if (pluginApi.plugins) {
        const plugin = pluginApi.plugins[options.id];
        if (plugin.run) {
            getDesignRasterizedToBlob(options.input, blob => {
                $(options.elem).html(plugin.html);
                plugin.run({
                    elem: options.elem,
                    input: blob,
                    output: options.output
                });
                trackEvent('Plugin', plugin.id);
            });
        } else { // load plugin
            JSZipUtils.getBinaryContent(plugin.path, (err, data) => {
                JSZip.loadAsync(data).then(zip => {
                    Promise.all([zip.file('plugin.html').async('string'), zip.file('plugin.js').async('string')]).then(values => {
                        plugin.html = values[0];
                        plugin.js = values[1];
                        //$('<script />').html(values[1]).appendTo('body'); // - set crossorigin attr?
                        // 'use strict'; // babel adds this itself
                        $('<script />').html(`(function(plugin) {\n${plugin.js}\n})(pluginApi.plugins[${JSON.stringify(plugin.id)}]);`).appendTo('body'); // - set crossorigin attr?
                        if (plugin.dependencies && plugin.dependencies.length) {
                            // - also support loading other .js files in the plugin bundle
                            const dependency = plugin.dependencies[0];
                            const script = document.createElement("script");
                            script.onload = function() { runPlugin(options); };
                            script.crossOrigin = "anonymous";
                            script.integrity = dependency.integrity;
                            script.src = dependency.src;
                            document.head.appendChild(script);
                            // $('<script />').on('load', function() { run(); }).attr({src: dependency.src, integrity: dependency.integrity, crossOrigin: "anonymous"}).appendTo('head');
                        } else {
                            runPlugin(options); // 'this' gets mangled by babel, so i just give a 'plugin' parameter
                        }
                    });
                });
            });
        }
    } else { // load index of plugins
        $.getJSON('/plugins/index.json', index => {
            pluginApi.plugins = index;
            runPlugin(options);
        });
    }
}

const levelNames = ['Basic', 'Designer', 'Pro'];

$(function() {
    // handles HTML classes (if any used) that show user info
    if ($('.showIfLoggedIn, .showIfLoggedOut, .userName, .userExpirationDate, .expiredUserWarning, .userLevelName').length)
        getUser(user => {
            //function reveal(loggedIn, unexpired) {
            ////$('.showIfLogged' + (loggedIn ? 'In' : 'Out')).css('display', 'block !important'); // important necessary because .nav>li in bootstrap   CSS overrides mere .showIf...
            ////$('.showIf' + (unexpired ? 'Paid' : 'Unpaid')).css('display', 'block !important'); // !important doesn't work in .css()
            $('.showIfLogged' + (user ? 'In' : 'Out')).addClass('importantDisplayBlock'); // important necessary because .nav>li in bootstrap CSS overrides mere .showIf...
            $('.showIf' + (user && user.unexpired ? 'Paid' : 'Unpaid')).addClass('importantDisplayBlock');
            if (user) {
                $('.userName').text(user.name);
                if (!user.unexpired)
                    $('.expiredUserWarning').slideDown();
                $('.userLevelName').text(levelNames[user.level]);
                $('.userExpirationDate').text(user.expiresDate.toLocaleDateString());
            }
        });
});

function hideBusy() {
    // if busy dlg never shown and page is reloaded, ie at least calls unload, calling this; cant call isopen cuz i havent initialized the dlg, so just eat error
    try {
        $('#loadingModal').modal('hide');
    } catch (e) {
        //log("Error hiding loading dlg: ", e)
    }
}

function showBusy(msg) {
    if (!/iPad|iPhone/.test(navigator.userAgent)) { // because iOS has no unload to atuomatically hide it
        if ((typeof $().emulateTransitionEnd == 'function')) { // Twitter Bootstrap loaded
            $('#loadingModal #loadingModalMsg').html(msg || "<p class=text-center>Please wait&hellip;</p>");
            $('#loadingModal').modal('show');
        } else {
            $('#loadingPopupMsg').html(_.isString(msg) ? msg : "Please wait...");
            $('#loadingMsg').dialog({
                modal: true,
                width: '500px',
                show: {
                    effect: 'fade',
                    duration: 500
                }
            });
        }
    }
}

$(function() {
    $(document).on('click', '#cancelLoading', function() {
        hideBusy();
        if (window.stop)
            window.stop();
    });
    if (!/iPad|iPhone/.test(navigator.userAgent)) { // because no unload event on mobile safari
        $(window).on('unload', hideBusy);
    }

    $('.logout').click(function(e) {
       if (getSessionToken()) {
            callImagingLambda({
                data: {user: 'endSession'},
                error: false,
                complete: function() {
                    logout();
                    location = '/login.php';
                }
            });
        } else {
            logout();
            location = '/login.php';
        }    
    });
});

$(function() {
    // contact form and faq search; important that contact form code be super reliable

    var uncaughtErrors = [];
    
    function escapeHtml(s) {
        return $('<div/>').text(s).html();
    }

    function formatData(design) {
        var params = {
                URL: location.href,
                title: $.trim($('title').text() || location.pathname || 'Untitled'),
                'User Agent': navigator.userAgent,
                Referrer: document.referrer || 'Unknown',
                account: window._user ? ("Logged in as " + _user.email) : "Not logged in" // - should be calling getUser()
                // $levelNames[$user_record['level']] ($user_expired ? '#User' : '#Customer')
            },
            uaParseResult,
            cookies = {},
            forms = {},
            span = '',
            //span = '<span style="font-weight: bold; display: inline-block; width: 10em;">', // freshdesk ignores <sytyle> css so i put it inline here and in the H2/H3
            html = '';

        try {
            if (design) // change URL to use design copy that support can see
                params.URL = params.URL.replace(/\bimgid=([-\w]+)/, 'imgid=' + design);

            $.each($('input, textarea, select'), function() {
                var field = $(this),
                    name = field.attr('name') || field.attr('id'),
                    form = field.parents('form'),
                    formName = form.attr('name') || 'Unnamed',
                    labelText = field.attr('id') && $('label[for="' + field.attr('id') + '"]').text(),
                    optionName,
                    v;
                if (name && form.attr('id') != 'helpContact' && !/off|cc|password/i.test(field.attr('autocomplete')) && !/password/i.test(field.attr('type'))) {
                    v = (!field.is(':checkbox') || field.is(':checked')) ? field.val() : '';
                    if (!forms.hasOwnProperty(formName))
                        forms[formName] = {};
                    v = escapeHtml(v);
                    if (/^SELECT$/i.test(field.prop('tagName'))) {
                        optionName = field.find('option[value="' + field.val() + '"]').text();
                        if (optionName != v)
                            v = optionName + ' ("' + v + '")';
                    }
                    forms[formName][labelText || name] = v;
                    params['form>' + (form.attr('name') || '') + '>' + name] = v;
                }
            });
            $('[contenteditable=true]').each(function() {
                var heading = "Editable Elements";
                if (!forms.hasOwnProperty(heading)) {
                    forms[heading] = {};
                }
                forms[heading][$(this).attr('id') || 'Unnamed'] = escapeHtml($(this).html());
            });
            if (0) {
                $.each(document.cookie.split(/; */), function() {
                    var kv = this.split('=');
                    if (kv[0] && kv[0] !== 'password' && !/^_/i.test(kv[0])) {
                        cookies[kv[0]] = decodeURIComponent(kv[1]);
                        params['cookie>' + kv[0]] = unescape(kv[1]);
                    }
                });
            }
            if (0) {
                var storeLimit = 50;
                $.each({
                    local: localStorage,
                    session: sessionStorage
                }, function(storeName, store) {
                    for (var i = 0; i < store.length; i++) {
                        var k = store.key(i),
                            s = store[k].toString();
                        params[storeName + '>' + k] = s.substr(0, storeLimit) + (s.length > storeLimit ? '...' : '');
                    }
                });
            }

            if (window.UAParser) {
                uaParseResult = UAParser();
                params['User Agent'] = $.trim([uaParseResult.device.vendor, uaParseResult.device.type, uaParseResult.device.model, uaParseResult.os.name, uaParseResult.os.version, uaParseResult.browser.name, uaParseResult.browser.version,
                    uaParseResult.cpu.architecture
                ].join(' ')) + ('ontouchstart' in window ? ' Touch' : '');
            }
            params.Screen = screen.width + ' x ' + screen.height;

            //html = 'Sent from <i>{{title}}</i> {{url}} previously on {{referrer}}<br>Using {{user_agent}} ({{screen}} pixels)<br>{{account}}<div>{{errors}}</div><div>{{forms}}</div>'; // embedding links (not just URLs) in the info put into FreshWidget's iframe URL for the description was triggering Edge's XSS security
            html = `Sent from "{{title}}"\n{{url}}\nPreviously on {{referrer}}\nWeb-browser: {{user_agent}} ({{screen}} pixels)\nUser's clock: ${(new Date()).toString()}\n{{account}}\n\n{{forms}}\n\n{{errors}}`;
            html = html.replace('{{title}}', params.title);
            html = html.replace('{{account}}', params.account);
            html = html.replace('{{referrer}}', params.Referrer || '');
            //html = html.replace('{{referrerTitle}}', params.Referrer || 'unknown referrer');
            html = html.replace('{{user_agent}}', params['User Agent']);
            html = html.replace('{{screen}}', params.Screen);
            html = html.replace(/{{url}}/g, params.URL);
            //html = html.replace('{{forms}}', $.isEmptyObject(forms) ? '' : '<h3 style="margin-top: 1em;">Forms</h3>' + $.map(forms, function(form, k) {
            html = html.replace('{{forms}}', $.isEmptyObject(forms) ? '' : /*'\n\nForms\n\n' +*/ $.map(forms, function(form, k) {
                //return '<div><h4 style="margin-top: 0.5em;">' + k + '</h4><div>' + $.map(form, function(v, k) {
                return 'Form "' + k + '"' + $.map(form, function(v, k) {
                    ////return '<p><span>' + k + '</span> ' + v;
                    //return '<p>' + span + k + '</span> ' + v;
                    return '\n' + k + ': ' + v;
                }).join(''); // + '</div>';
            }).join('\n\n'));
            /*html = html.replace('{{cookies}}', $.isEmptyObject(cookies) ? '' : '<h3 style="margin-top: 1em; margin-bottom: 0.5em;">Cookies</h3>' + $.map(cookies, function(v, k) {
                //return '<p><span>' + k + '</span> ' + v;
                return '<p>' + span + k + '</span> ' + v;
            }).join(''));*/

            html = html.replace('{{errors}}', uncaughtErrors.length ? 'Errors' /*'<h3 style="margin-top: 1em; margin-bottom: 0.5em;">Errors</h3>'*/ + $.map(uncaughtErrors.slice(-20), function(error) {
                //return '<p>' + error.at + '<br>' + (error.arguments[1] || 'UnknownScriptURL') + ':' + error.arguments[2] + ' ' + error.arguments[0];
                return '\n' /*+ error.at*/ + (error.arguments[1] || 'UnknownScriptURL') + ':' + error.arguments[2] + ' ' + error.arguments[0];
            }).join('') : '');
        } catch (e) {}

        return html;
    }

    /*
    - mailcheck
    ~ stem words? https://github.com/words/stemmer though freshdesk seems to stem a bit
    ? does this cause Freshdesk to not get info about what answers peope like, to improve sorting in future
    */

    const faqCache = {};
    let answerBodies, lastFaqKey;

    function getAnswerText(answer) {
        return [answer.title, answer.source.article.desc_un_html].join(' ').toLowerCase();
    }

    function tokenize(s) {
        return _.unique(s.toLowerCase().match(/[\w']{2,}/g)) || [];
    }

    function showResults(terms, answers) {
        // answers=[{title, desc (abbeviated body), group, url, source: {article: {desc_un_html (plain text), description}}}, {}]
        const term_freq = {};
        terms.forEach(term => {
            if (!(term in term_freq)) {
                term_freq[term] = 0;
                answers.forEach(answer => {
                    if (getAnswerText(answer).search(term) != -1)
                        term_freq[term]++;
                });
                // ? or could build an array of which faqs contain which terms to speed the op below; not that it's noticeably slow
            }
        });
        /*function score(answer) {
            let x = (answers.length - answer.i) / answers.length / 1000; // this default value causes answers to by default be sorted by order in answers array
            $.each(term_freq, function(term, freq) {
                const i = getAnswerText(answer).search(term);
                x += i != -1 ? 1 / (term_freq[term] + i / 100.0) : 0;
                //console.log([freq, term, i])
                // favors words that are in few answers, and words that are early in an answer
            });
            return x;
        }*/
        // answerBodies = _.sortBy(answers, score).reverse();
        answerBodies = _.sortBy(answers, answer => -1 * _.intersection(tokenize(answer.title), terms).length);
        // $('.matchingFaqs').html(highlightTerms(term_freq, $.map(answers.slice(0, answerSetSize), formatQuestion).join('')));
        $('.matchingFaqs').html(answerBodies.length
            ? answerBodies.slice(0, 8).map(faq => `<button class="btn btn-link btn-block faqtoidQuestion" style="text-align: left; padding-left: 12px;">${highlightTerms(terms, faq.title)}</button>`)
            : "<p>I didn't find any matching answers. Please try rephrasing your question.</p>"
        ).slideDown().append(`<a class="btn btn-link btn-block text-center" href="https://patrickroberts.freshdesk.com/support/home" target=rrFaq>Browse all the answers to common questions here.</a>`);
    }

    function search() {
        const s = $('#helpQuery').val(), terms = tokenize(s), key = terms.join(' ');
        // so get terms arary then rejoin for getting faqs; cache that
        if (key != lastFaqKey) {
            lastFaqKey = key;
            if (terms.length) {
                // localStorage.faqSearchQuery = s;
                if ($('#helpContact').is(":hidden")) {
                    // allow user to contact us only after he's at least tried searching and looking at results
                    setTimeout(function() { $('.showHelpContact').slideDown(); }, 1000);
                    // ? would be nice if this would remain shown for a few hours, but that gets a bit complicated; once SPA it would remain shown
                }
                $('#answerArea').slideUp();
                if (faqCache[key]) {
                    showResults(terms, faqCache[key]);
                } else {
                    $('.matchingFaqs').html('<i class="fa fa-spinner fa-pulse"></i>');
                    $.getJSON(`https://patrickroberts.freshdesk.com/support/search/solutions.json?term=${encodeURIComponent(key)}`, r => {
                        showResults(terms, faqCache[key] = r);
                    });
                }
            } else {
                $('.matchingFaqs, #answerArea').slideUp();
            }
        }
    }

    $('#helpModal').on('click', '.faqtoidQuestion', function() {
        // $('#faqAnswer').attr('src', $(this).attr('data-src'));
        const answer = answerBodies[$(this).index()];
        $('.matchingFaqs').slideUp();
        $('#answerArea').slideDown();
        $('#answerArea').find('p').html(answer.title);
        $('#faqAnswer').html(answer.source.article.description).find('img, iframe').attr('style', 'max-height: 80vh;').addClass('img-responsive');
        $('#faqAnswer span').removeAttr('style');
        $('#faqAnswer br').remove();
        $('#faqAnswer a[href*="help"]').click(function (e) {
            e.preventDefault();
            $('.showHelpContact').click();
        });
        trackEvent('FAQ', 'questionClicked', $(this).text());
    });
    $('.backtoQuestions').click(function() {
        $('#answerArea').slideUp();
        $('.matchingFaqs').slideDown();
    });

    $('#helpQuery').on('keyup change', _.debounce(search, 1000));

    function fillUserEmail() {
        getUser(user => {
            const accountEmail = user && user.email;
            const field = $('#helpContact input[type=email]');
            if (accountEmail || !field.val().trim())
                field.val(accountEmail || $.cookie('email') || '');
        });
    }

    $('.showHelpContact').click(function() {
        $('#helpContact').slideDown(400, function() {
            $('#helpContact')[0].scrollIntoView();
            fillUserEmail();
            const messageField = $('#helpContact textarea'), nameField = $('#helpContact input[type=text]');
            if (!messageField.val().trim()) // copy search query to message (if empty)
                messageField.val($('#helpQuery').val().trim());
            if (!nameField.val().trim() && window._user)
                nameField.val(_user.name || '');
        });
        $('.showHelpContact, .helpMessageSent').slideUp();
    });
    
    $(window).on('pageshow', function() { 
        if ($('#helpContact').is(':visible')) {
            fillUserEmail(); // safari loses email when backing to this page
        }
    });
    
    function createTicket(design) {
        const form = $('#helpContact'), message = form.find('textarea').val().trim();
        $('.helpMessageNotSent').slideUp();
        if (message.length < 14) {
            alert("Please enter a complete message.");
            return;
        }
        callImagingLambda({
            data: {
                createTicket: form.find('input[type=email]').val().trim(),
                subject: `Rapid Resizer: "${message.trim().replace(/\s+/g, ' ').substr(0, 40)}..."`,
                message: message.replace(/\n+/g, '<br><br>'), // freshdesk expects HTML msg body but is smart enough to remove script tags
                name: form.find('input[type=text]').val().trim(),
                settings: formatData(design)
            },
            success: function(r) {
                if (r) {
                    $('.helpMessageSent, .showHelpContact').slideDown();
                    $('#helpContact').slideUp();
                } else {
                    $('.helpMessageNotSent').slideDown();
                }
            },
            error: function(xhr, status, error) {
                $('.helpMessageNotSent').slideDown();
            }
        });
    }

    $('#helpContact').submit(function(e) {
        e.preventDefault();
        var m = location.href.match(/\bimgid=([-\w]+)/); // check if this page involves a design
        if (m) {
            dialogs.confirm("Include Your Design?", "Is it ok if we can see this design? It often helps us to solve your problem.", ok => {
                // if not logged in then design must be (for now) in rrotmp, so can keep same url, though probably shiouldn't rely on that and just let lambda figure it out; though soon even not logged in users will have a private session with tmp saved designs
                if (ok) {
                    callImagingLambda({
                        data: {
                            shareDesignWithSupport: m[1]
                        },
                        success: r => {
                            createTicket(r && r.key);
                        }
                        //error: // - should still send message on shareDesignWithSupport error but callImagingLambda doesn't yet support that
                    });
                } else {
                    createTicket('NotAllowed');
                }   
            }, ['No', 'Yes']);
        } else {
            createTicket();
        }
    });
    
    function showHelpForm() {
        $('#helpModal').modal('show');
        search();
    }

    $('.showFaqtoid').click(function(e) {
        e.preventDefault();
        showHelpForm();
    });

    if (!window.onerror) {
        window.onerror = function( /*errorMsg, url, lineNumber*/ ) {
            uncaughtErrors.push({
                at: Date(),
                arguments: arguments
            });
        };
    }

    function highlightIntervals(s, highlights) {
        // s is plain text and highlights is an array of {start:int, end:int}
        let lastStart = Infinity;        
        _.sortBy(highlights, 'start').reverse().forEach(h => {
            if (lastStart >= h.end) { // prevent overlaps; - probably not the best way to do; occurs when eg search for "mirror or"...; tokens used when preparing highlights should probably be sorted by length, longest first
                s = `${s.slice(0, h.start)}<mark>${s.slice(h.start, h.end)}</mark>${s.slice(h.end)}`;
            }
            lastStart = h.start;
        });
        return s;
    }
    function highlightTerms(terms, s) {
        // terms is aray of words
        try {
            const exclude = "i you why how have to it get the a an and at of me my can do let use with for in only is there where what was were will to from does on this that if isn't it's its".split(' ');
            const highlights = [];
            terms.forEach(term => {
                if (!exclude.includes(term.toLowerCase())) {
                    const re = new RegExp(`${term}\\b|\\b${term}`, 'gi');
                    let m;
                    while ((m = re.exec(s)) !== null) {
                        highlights.push({
                            start: m.index,
                            end: re.lastIndex
                        });
                    }
                }
            });
            return highlightIntervals(s, highlights);
        } catch (e) { return s; }
    }
});

$(function() {
    $('.designStep').on('click', function() {
        const step = $(this).attr('data-step'),
            designId = curThumbnail.attr('data-dbid');
        if (step === 'delete') {
            if (confirm("Do you really want to permanently delete this design?")) {
                $('#loadDesignModal').modal('hide');
                deleteImageOnline(designId);
                curThumbnail.parent().remove(); // curThumbnail is set by the func in util.js
            }
        } else if (step === 'edit') {
            location.href = `/make-name-patterns.php?design=${encodeURIComponent(JSON.stringify($.parseJSON($(this).attr('data-src')).design))}`;
        } else {
            location.href = step + '.php?' + $.param({
                imgid: designId
            });
        }
    });

    window.showActionsOnDesignThumbnailClick = function() {
        $('body').on('click', '.patternThumbnail', function() {
            const img = $(this);
            window.curThumbnail = img;
            getDesign( // neednt be rasterized
                img.attr('data-dbid'),
                function(url) {
                    // - if is svg and has data-src in svg tag then show edit button; handle clicking on edit button above
                    $('#dialogImage').attr('src', url);
                    $('#dialogImageInfo').hide();
                    $('#loadDesignModal').modal('show');
                    $('button[data-step=edit]').slideUp();
                    $.ajax({
                        url: url,
                        dataType: 'xml',
                        success: xml => {
                            if (xml.childNodes[0].tagName.toLowerCase() === 'svg') {
                                const src = xml.childNodes[0].getAttribute('data-src');
                                if (src) {
                                    $('button[data-step=edit]').attr('data-src', src).slideDown();
                                    const parsedSrc = JSON.parse(src);
                                    if (parsedSrc.tool === 'letter')
                                        $('#dialogImageInfo').html(`Fonts: ${_.pluck(parsedSrc.design, 'font').join(', ')}`).slideDown();
                                }
                            }
                        }
                    });
                },
                /*
                function (blob) {
                    URL.revokeObjectURL($('#dialogImage').attr('src'));
                    $('#dialogImage').attr('src', URL.createObjectURL(blob));
                    // need object url for img, neednt be rasterized
                    $('#loadDesignModal').modal('show');
                },
                */
                'url' //'blob',
                //true
            );
        });
    };

    /*
    conflicted with juicer widget on start.php
    function fitBottom() {
        $('body').css('margin-bottom', $('#footer').height());
    }
    $(window).resize(fitBottom);
    fitBottom();
    */

    //FastClick.attach(document.body); // broke clicking on fonts when running as pinned to iphone home screen

    $('.currentYear').text(new Date().getFullYear());

    $('a[href^="buy"],a[href$="buy"],a[href="buy"]').click(function(e) {
        e.preventDefault();
        getUser(function(user) {
            location.href = 'https://www.rapidresizer.com/buy?' + $.param({
                email: queryParams.email || (user || {}).email || $.cookie('email'),
                name: (user || {}).name
            });
        });
    });

    if (/\bimgid=\w/.test(location.search)) {
        try {
            localStorage.lastDesign = location.pathname + location.search;
        } catch (e) {}
    }

    if ($.browser.msie)
        $('input[type=file]').each(function() {
            // stupid fix for IE because it doesn't support file inputs hidden in label, so I just replace the label with the file input shown
            //const label = $(this).closest('label');
            //label.parent().before($(this).show());
            //label.remove();
            $(this).parent().contents().filter(function() {
                return this.nodeType === 3;
            }).remove(); // remove text from label
            $(this).show();
        });

    if (getSessionToken() && (new Date()).getTime() - localStorage.rapidResizerTokenCreationTime > 24 * 60 * 60 * 1000) {
        // refresh token if more than a day old
        _.delay(function() {
            //log(`refreshing creation time token ${localStorage.rapidResizerTokenCreationTime}`);
            callImagingLambda({
                data: {
                    user: 'refreshToken'
                },
                success: function(token) {
                    //console.log('refreshed token', token);
                    if (token) {
                        localStorage.rapidResizerToken = token;
                        localStorage.rapidResizerTokenCreationTime = (new Date()).getTime();
                        //log(`new creation time token ${localStorage.rapidResizerTokenCreationTime}`);
                    }
                }
            });
        }, 20*1000); // deferred to avoid race conditions with other lambda requests using the previous token
    }

    if (!/^\/(login|resetpw|help)/i.test(location.pathname) && !getSessionToken()) {
        // include sumo for list optin and social sharing
        $("<script async>(function(s,u,m,o,j,v){j=u.createElement(m);v=u.getElementsByTagName(m)[0];j.async=1;j.src=o;j.dataset.sumoSiteId='28f1496688d2d9b6d370df3f9fc769acd11269fa795e7877a98712066013c020';v.parentNode.insertBefore(j,v)})(window,document,'script','//load.sumo.com/');</" + 'script>').appendTo(document.body);
    }

    if (/^\/(login|start|resize)/i.test(location.pathname)) {
        if (/samsung/i.test(navigator.userAgent)) {
            $('.browserWarning').html(`Rapid Resizer isn't compatible with this web-browser. Please use a recent version of the <a href="https://www.google.com/chrome/">Chrome browser</a>.`).slideDown();
        } else if ($.browser.desktop && ($.browser.msie || ($.browser.mozilla && $.browser.version < 70) || ($.browser.safari && $.browser.versionNumber < 10) || ($.browser.chrome && $.browser.versionNumber < 40))) {
            // https://github.com/gabceb/jquery-browser-plugin
            // assumes mobile devices are kept up to date and that iOS Chrome is essentially Safari and still works       
            $('.browserWarning').find('span').text($.browser.mac ? 'Safari' : 'Edge'); // $.browser.win
            $('.browserWarning').slideDown();
        }
    }
});

const dialogs = {
    alert: (title, body, callback) => {
        const modal = $('#dialogModal').clone().removeAttr('id'); // clone the modal then i don't have to worry about clearing event handlers, deferring, and other resetting
        modal.find('.modal-title').text(title);
        modal.find('.modal-body').html(body);
        const buttons = modal.find('.modal-footer .btn');
        buttons.hide().last().show();
        modal.on('hidden.bs.modal', () => {
            if (callback)
                callback();
            modal.remove();
        });
        modal.modal('show'); // automatically appends clone to page body
    },
    confirm: (title, body, callback, labels=['Cancel', 'OK']) => {
        const modal = $('#dialogModal').clone().removeAttr('id');
        modal.find('.modal-title').text(title);
        modal.find('.modal-body').html(body);
        const buttons = modal.find('.modal-footer .btn');
        modal.on('hidden.bs.modal', () => { modal.remove(); });
        if (callback) {
            modal.find('.dialogModalCancel').on('click', function() { callback(false); });
            modal.find('.dialogModalOk').on('click', function() { callback(true); });
        }
        modal.modal('show');
        labels.forEach((label, i) => buttons.eq(i).text(label));
    },
    prompt: (title, body, callback, labels=['Cancel', 'OK']) => {
        const modal = $('#dialogModal').clone().removeAttr('id');
        modal.find('.modal-title').text(title);
        modal.find('.modal-body').html(body + '<input style="margin-top: 1em;" autocomplete=off type=text class="form-control">');
        const buttons = modal.find('.modal-footer .btn');
        modal.on('hidden.bs.modal', () => { modal.remove(); });
        if (callback) {
            modal.find('.dialogModalCancel').on('click', function() { callback(null); });
            modal.find('.dialogModalOk').on('click', function() { callback(modal.find('input').val()); });
        }
        modal.modal('show');
        labels.forEach((label, i) => buttons.eq(i).text(label));
    },
    survey: (title, body, options, name, callback, labels=['Cancel', 'Continue']) => {
        const modal = $('#dialogModal').clone().removeAttr('id');
        modal.find('.modal-title').text(title);
        modal.find('.modal-body').html(body).append(_.shuffle(_.map(options, (html, name) => 
            // $('<p>').append($('<label>').append($('<input>').attr({type: 'radio', name: 'surveyOption', style: "margin-right: 0.5em;", value: name}), $('<span>').attr({style: "display: inline-block;"}).html(html))))
            `<p><label>
                <span style="display: inline-block; vertical-align: top; margin-right: 0.5em;">
                    <input type=radio name=surveyOption value="${name}">
                </span>
                <span style="display: inline-block;">${html}</span>
            </label></p>`
        ))).append('<input style="margin-top: 1em;" autocomplete=off type=text class="form-control" placeholder="Or enter a unique answer here">');
        const buttons = modal.find('.modal-footer .btn'), textField = modal.find('input[type=text]');
        textField.on('focus', function() {
            modal.find('input[name=surveyOption]').prop('checked', false);
        });
        modal.find('.dialogModalCancel').on('click', function() { callback(null); });
        modal.find('.dialogModalOk').on('click', function() {
            callback(true); // done first in case trackEvent raises and error
            trackEvent('Survey', name, modal.find('input[name=surveyOption]:checked').val() || textField.val().trim());
        });
        modal.on('hidden.bs.modal', () => { modal.remove(); });
        modal.modal('show');
        labels.forEach((label, i) => buttons.eq(i).text(label));
    }
};
