/* jshint esversion: 6, browser: true, devel: true */
/* globals _:false, $:false, log:false, localStorage:false, showBusy:false, hideBusy:false, jsfeat:false, getImageData:false, getImageFromURL:false, showImageDownload:false, makeSocialURL:false, proportionallyLimitArea:false, showMaillistInterstitial:false, uploadImage:false, resizeImage:false, PDFJS:false, Handlebars:false */
'use strict';

$(function() {
    var hue = 0; // 0 - 360

    if (getSessionToken())
        $('h1, title').text($('h1').text().replace('Free ', ''));

    const _update = _.debounce(function() {
        // - ideally, move all this to a worker
        var img = $('#origImg')[0],
            size = [img.naturalWidth, img.naturalHeight],
            mode = $('input[name=mode]:checked').val(),
            thresholdMode = $('input[name=thresholdMode]:checked').val(),
            threshold = 255 - parseFloat($('#thresholdSlider').val()),
            canvas = $('#pictureStencil')[0],
            blur = parseFloat($('#blurSlider').val()),
            radius = Math.ceil(0.1 * _.min(size) * blur / $('#blurSlider').attr('max')) || 1,
            effects = [];//[['flatten']];
        //alert('onfilter: ' + img.naturalWidth + ' ' + img.naturalHeight + ' ' + img.width + ' ' + img.height);

        $('.tracingBusy').show();
        
        // had weird problem on android device with the stencil img being stretched; rebooting it fixed the problem
        // - at least for the edges method, enlarging the image using drawImage might improve the result
        
        if (!(mode === 'adaptive' || (mode === 'blobs' && thresholdMode === 'hue')) && blur > 0)
            effects.push(['gaussianBlur', [0, blur]]);
        if (mode === 'edges') {
            effects = effects.concat([['negate'], ['edge', 2], ['threshold', 255 - threshold], ['negate']]);
        } else if (mode === 'blobs' && thresholdMode === 'hue') {
            effects = effects.concat([['hueThreshold', [threshold * 360 / 255, hue]]]);
            if ($('#outline').prop('checked'))
                effects = effects.concat([['outline', [50, 100]], ['negate']]);
        } else if (mode === 'canny') {
            effects = effects.concat([['outline', [(255 - threshold) / 3, 255 - threshold]], ['negate']]);
        } else {
            if (mode === 'adaptive') {
                effects.push(['adaptiveThreshold', [threshold, radius]]);
            } else {
                effects = effects.concat([['equalizeHistogram'], ['threshold', threshold]]);
            }
            if ($('#outline').prop('checked'))
                effects = effects.concat([['outline', [50, 100]], ['negate']]);
        }
        transformImage(img, effects, canvas);

        $('.tracingBusy').fadeOut();
    }, 100);

    function update() {
        $('.tracingBusy').fadeIn(100, _update);
    }
    $('#thresholdSlider, #blurSlider, #radiusSlider, #outline').change(update);

    function showOriginalImage(imgOrCanvas) {
        const dataUri = transformImage(imgOrCanvas, [['limitArea'], ['flatten']]).toDataURL();
        //alert('img transformed');
        $('#origImg').attr('src', dataUri);
        if (($.browser.msie || $.browser.msedge) && window.sessionStorage)
            // since MS browsers don't keep file input set when clicked back to this page
            // ? do this in all browsers; sessionStorage is apparenty separate so might be safe to use the space
            sessionStorage.pictureStencilOriginal = dataUri; //reader.result;
    }

    const loadImage = _.debounce(function() {
        //alert('pic file input changed');
        // - https://stackoverflow.com/questions/20600800/js-client-side-exif-orientation-rotate-and-mirror-jpeg-images
        const files = $('input[name=pictureFile]')[0].files;
        if (files && files.length > 0) {
            const file = files[0];
            if ('size' in file) {
                if (file.size <= 0) {
                    alert("The file's empty.");
                    return;
                }
            }
            /*if (file.name) { // covered by accept attribute of file input
                var m = /\.(\w+)$/i.exec(file.name)
                if (!m || exts.indexOf(m[1].toLowerCase()) == -1) {
                    alert(typeError)
                    return false
                }
            }*/
            if (file.type == "application/pdf") { 
                const reader = new FileReader();
                reader.addEventListener('load', function() {
                    window.pdfPageSelector(reader.result, pageCanvas => {
                        showOriginalImage(pageCanvas);
                    });
                });
                reader.readAsArrayBuffer(file); // readAsDataURL() caused a CORS error in IE/Edge in PDF.js's worker
            } else if (/^image/i.test(file.type)) {
                const url = URL.createObjectURL(file);
                //alert('got url');
                getImageFromURL(url, function(img) {
                    //alert('got img');
                    URL.revokeObjectURL(url);
                    if (img) {
                        showOriginalImage(img);
                    } else {
                        $('.tracingBusy').fadeOut();
                        alert("This only accepts PNG, JPG, GIF, BMP, PDF, and SVG images.");
                    }
                });
                $('.tracingBusy').show();
            } else
                alert("This doesn't seem to be an image.\n\nIf it's a document file, try to open it on your computer and export the image out of it.");
        }
    }, 300);
    $('input[name=pictureFile]').change(loadImage);
    $(window).on('popstate, pageshow, load', loadImage);

    function showSelectedHue() {
        const rgb = util.hsvToRgb(hue / 360);
        $('.selectedThresholdHue').css('background-color', `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`);
    }    
    function guessHue() {
        const vibrant = new Vibrant($('#origImg')[0]);
        hue = vibrant.swatches().Vibrant.getHsl()[0] * 360;    
        showSelectedHue();
    }
    
    $('#origImg').on('load', function() {
        $(this).fadeIn(400, update);
        //if ($('input[name=thresholdMode][value=hue]').is(':visible'))
        updateControls();
        _.defer(guessHue);
    }).attr({crossorigin: 'anonymous', src: (window.sessionStorage && sessionStorage.pictureStencilOriginal) || 'https://s3.amazonaws.com/static.rapidresizer.com/img/daisy.jpg'}); // https://static.rapidresizer.com/img/daisy.jpg 
    //}).attr('src', (window.sessionStorage && sessionStorage.pictureStencilOriginal) || 'daisy.jpg');

    function updateControls() {
        var mode = $('input[name=mode]:checked').val(), thresholdMode = $('input[name=thresholdMode]:checked').val();
        $('#thresholdModes')[mode === 'blobs' ? 'slideDown' : 'slideUp']();
        $('.hueThresholdOptions')[mode === 'blobs' && thresholdMode === 'hue' ? 'slideDown' : 'slideUp']();
        $('.sharpnessControls')[mode === 'blobs' && thresholdMode === 'hue' ? 'slideUp' : 'slideDown'](); // because my gaussianBlur (needlessly?) makes it grayscale so won't work with hue
        if (_.contains(['edges', 'canny'], mode)) {
            //$('#outline').prop('checked', false)
            $('.forOutline' /*'label[for=outline]'*/ ).slideUp();
            $('.forEdges').slideDown();
        } else {
            $('.forOutline' /*'label[for=outline]'*/ ).slideDown();
            $('.forEdges').slideUp();
        }
        update();
    }
    $('input[name=mode], input[name=thresholdMode]').change(updateControls);

    $('#downloadStencil').click(function() {
        showMaillistInterstitial(function() {
            showImageDownload($('#pictureStencil')[0].toDataURL());
        }, $(this).text().trim());
    });
    /*$('#orderStencil').click(function () {
        showMaillistInterstitial(function() {
            showBusy();
            location.href = 'upload.php?step=make3d&web=' + escape('online.rapidresizer.com/' + getFilteredURL());
        }, 'Order');
    })*/
    $('#resizeStencil').click(function() {
        showMaillistInterstitial(function() {
            uploadImage({
                image: $('#pictureStencil')[0],
                normalize: true,
                success: function(r) {
                    location.href = r.url;
                }
            });
        });
    });
    /*$('#pictureStencil').click(function() {
        //window.open($(this)[0].toDataURL());
        showMaillistInterstitial(function() {
            //location = $(this)[0].toDataURL();
            window.open($('#pictureStencil')[0].toDataURL());
        }, 'Download');
    });*/

    $('button[data-share-design]').click(function() {
        const service = $(this).attr('data-share-design');
        trackEvent('Designs', `share:${service}`);
        if (service === 'pinterest') { // pinterest doesnt accept svgs
            uploadImage({
                image: $('#pictureStencil')[0],
                success: function(r) {
                    getUploadedUrl(r.key, function (url) {
                        shortenURL(url, function (url) { // pinterest wasn't working with long s3 temp urls
                            location.href = 'https://pinterest.com/pin/create/button/?' + $.param({
                                url: 'http://RapidResizer.com/picture-stencil',
                                media: url,
                                description: "Turn an image into an art pattern at RapidResizer.com #stencils #RapidResizer" // pinterest no longer allows full urls in text
                            }).replace(/\+/g, '%20');
                        });
                    });
                }
            });
        } else {
            const srcCanvases = [createCanvasFromImage($('#origImg')[0]), $('#pictureStencil')[0]];
            let combinedCanvas = document.createElement('canvas');
            combinedCanvas.width = srcCanvases[0].width * 2;
            combinedCanvas.height = srcCanvases[0].height;
            const context = combinedCanvas.getContext('2d');
            context.drawImage(srcCanvases[0], 0, 0);
            context.drawImage(srcCanvases[1], srcCanvases[0].width, 0);
            combinedCanvas = transformImage(combinedCanvas, [['resize', [[1200, 630]]], ['flatten']]); //resizeImageToCanvasimg, proportionallyLimitArea([img.width, img.height]), true);
            let sharingWindow;
            //if (service === 'facebook') {
            sharingWindow = open();
            sharingWindow.document.write(`<title>Sharing</title><body style="font-family: sans-serif; padding: 3em;">Loading...`);
            //}
            uploadImage({
                image: combinedCanvas, //$('#pictureStencil')[0],
                success: function(r) {
                    getUploadedUrl(r.key, url => {
                        const apiUrl = 'https://od8ipm3wxa.execute-api.us-east-1.amazonaws.com/production/uploadimage';
                        const params = $.param({
                            share: url,
                            width: combinedCanvas.width,
                            height: combinedCanvas.height
                        });
                        const designUrl = `${apiUrl}?${params}`;
                        shortenURL(designUrl, designUrl => {
                            // shortened for at least twitter (because of that huge s3 tmp url in it)
                            let shareUrl;
                            if (service === 'facebook') {                        
                                shareUrl = 'http://www.facebook.com/sharer.php?' + $.param({u: designUrl});
                                //log(fbUrl);
                            } else if (service === 'twitter') {
                                shareUrl = 'https://twitter.com/share?' + $.param({
                                    url: designUrl,
                                    text: "Made by Rapid Resizer's picture stencil maker #stencils #RapidResizer"
                                });
                            }
                            sharingWindow.location.href = shareUrl;
                        });
                    });
                }
            });
        }
        /*else if (service === 'link') { // could do this saying it will only last ~24h?
                   shortenURL(makeSocialURL(), function(url) { prompt("Press Ctrl+C to copy your link.\n\nIt goes to this page with your chosen text, font, and other settings.", url) });
               } else if (service === 'email') {
                   location.href = 'mailto:?' + $.param({
                       subject: "\"" + makeDesignName() + "\" Stencil Design",
                       body: "Print, customize, or make your own design at:\n\n" + makeSocialURL()
                   }).replace(/\+/g, '%20');
               } */
    });

    $('#origImg').click(function (e) {
        // - nice to add touch control and to have a zoom window to make it easier to control color chosen or change UI to make original largert
        // getImageData by default gets the img as scaled on page, which is fine since that's what offsetX is
        const data = getImageData($('#origImg')[0]),
            i = (data.width * e.offsetY + e.offsetX) * 4;
        hue = util.rgbToHsv(data.data[i], data.data[i + 1], data.data[i + 2])[0] * 360;
        showSelectedHue();
        $('input[name=thresholdMode][value=hue]').click();
        update();
    });
    //showSelectedHue();
});
