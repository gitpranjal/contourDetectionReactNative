// colors values used for proper greyscale
const magicValues = [0.2126, 0.7152, 0.0722];
const clampTypes = ['REPEAT', 'REFLECT', 'WRAP', 'WHITE', 'BLACK'];


/**
 * Effects
 * #All effects take a source canvas and destination canvas
 * #The soruce canvas is the image to be modified, the destination is where the modified image is placed
 * #All effects return a new canvas if a destination is not supplied
 * #Most effects also take arguments to tweak how they operate
 */
const effects = {

    /** Greyscale
     */
    greyscale: (srcCanvas) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height),
            context = dstCanvas.getContext('2d');
            
            

        context.globalCompositeOperation = 'color';
        if (context.globalCompositeOperation == 'color') {
            
            context.drawImage(srcCanvas, 0, 0);
            context.fillStyle = 'black';
            context.fillRect(0, 0, dstCanvas.width,
            dstCanvas.height);
            
            
        } 
        else 
        {
            context.putImageData(mapCanvasPixels(srcCanvas, pixel => {
                const v = magicValues[0] * pixel[0] + magicValues[1] * pixel[1] + magicValues[2] * pixel[2];
                return [v, v, v, pixel[3]];
            }), 0, 0);
        }

        return dstCanvas;
    },

    /** Despeckle\
     * @args[0]: threshold, deviation threshold for smoothing
     * @args[1]: radius, size of sampling radius
     * @args[2]: blackLevel, 0-1 only include pixels brighter than this
     * @args[3]: whiteLevel, 0-1 only include pixels darker than this
     */
    despeckle: (srcCanvas, radius = 10, threshold = 8, blackLevel = 0.1, whiteLevel = 0.1) => {
        // smooths areas where noise is noticable while leaving complexities alone
        // the standard deviation of each pixel and its neighbors (within radius) is calculated to determine if the area is one of high or low complexity
        // complexity below threshold means the area is smoothed using a simple mean filter

        // iterate through pixels..
        // for all pixels within radius
        // calculate standard deviation:
        // U = mean (average) of the data set
        // N = length of the data set
        // deviation(n) = sqrt(pow(n - U, 2) / N)

        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);

        const halfRad = Math.floor(radius / 2);
        const bl = Math.floor(util.map_range(blackLevel, 0, 1, 0, 255));
        const wl = Math.floor(util.map_range(whiteLevel, 0, 1, 0, 255));

        const src = srcCanvas.getContext('2d').getImageData(0, 0, srcCanvas.width, srcCanvas.height).data;
        const imageData = mapCanvasPixels(srcCanvas, (pixel, idx, x, y) => {
            let avg = [0, 0, 0];
            let tot = 0;

            // gather the average of all surrounding pixels
            for (let xoff = -halfRad; xoff < halfRad; xoff++) {
                for (let yoff = -halfRad; yoff < halfRad; yoff++) {
                    const px = util.clamp(x + xoff, 0, srcCanvas.width);
                    const py = util.clamp(y + yoff, 0, srcCanvas.height);

                    // get the index of neighbor pixel
                    //neighborIndex = (py * size[0] + px) * 4;
                    let neighborIndex = util.getIndexAt(px, py, srcCanvas.width);

                    // add neighbor values to average
                    avg[0] += src[neighborIndex];
                    avg[1] += src[neighborIndex + 1];
                    avg[2] += src[neighborIndex + 2];
                    //avg[3] += src[neighborIndex + 3];
                    tot++;
                }
            }

            avg[0] /= tot;
            avg[1] /= tot;
            avg[2] /= tot;
            //avg[3] /= tot;

            // get pixel luminance
            const v = magicValues[0] * pixel[0] + magicValues[1] * pixel[1] + magicValues[2] * pixel[2];
            const inRange = (v >= bl && v <= wl);

            // get pixel range deviation
            const deviation = [0, 0, 0];
            deviation[0] = Math.sqrt(Math.pow(pixel[0] - avg[0], 2) / tot);
            deviation[1] = Math.sqrt(Math.pow(pixel[1] - avg[1], 2) / tot);
            deviation[2] = Math.sqrt(Math.pow(pixel[2] - avg[2], 2) / tot);
            //deviation[3] = Math.sqrt(Math.pow(pixel[3] - avg[3], 2) / tot);

            if (inRange && (deviation[0] + deviation[1] + deviation[2] <= (threshold * 3))) {

                // return [0, 0, 0, 255]
                return [avg[0], avg[1], avg[2], 255];
            } else {
                return pixel;

            }

            //pixel[0] = (deviation[0] <= threshold && inRange) ? avg[0] : pixel[0];
            //pixel[1] = (deviation[1] <= threshold && inRange) ? avg[1] : pixel[1];
            //pixel[2] = (deviation[2] <= threshold && inRange) ? avg[2] : pixel[2];
            //pixel[3] = 255;

            // return pixel;
        });

        dstCanvas.getContext('2d').putImageData(imageData, 0, 0);
        return dstCanvas;
    },

    /**
     * Threshold
     * @args[0]: threshold, brightness threshold for black-or-white 0-255
     */
    threshold: (srcCanvas, threshold = 120) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);
        /*dstCanvas.getContext('2d').putImageData(mapCanvasPixels(srcCanvas, pixel => {
            const v = (magicValues[0] * pixel[0] + magicValues[1] * pixel[1] + magicValues[2] * pixel[2] >= threshold) ? 255 : 0;
            return [v, v, v, pixel[3]];
        }), 0, 0);*/
        const imgData = srcCanvas.getContext('2d').getImageData(0, 0, srcCanvas.width, srcCanvas.height), data = imgData.data;
        let i = (srcCanvas.width * srcCanvas.height) * 4;
        do {
            const v = (magicValues[0] * data[i - 4] + magicValues[1] * data[i - 3] + magicValues[2] * data[i - 2] >= threshold) ? 255 : 0;
            i -= 2;
            data[i] = v;
            data[--i] = v;
            data[--i] = v;
        } while (i);
        dstCanvas.getContext('2d').putImageData(imgData, 0, 0);     
        return dstCanvas;
    },

    /**
     * Hue-Threshold
     * @args[0]: threshold, deviation tolerance from given hue
     * @args[1]: hue, HSV (0-360) color value
     */
    hueThreshold: (srcCanvas, threshold = 90, center = 150) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);
        threshold = Math.min(179, Math.ceil(threshold / 2));
        const min = center - threshold, max = center + threshold;
        const imageData = mapCanvasPixels(srcCanvas, (pixel, i, x, y) => {
            const h = util.rgbToHsv(pixel[0], pixel[1], pixel[2])[0] * 360;
            let r;
            if (min >= 0 && max <= 359)
                r = h >= min && h <= max;
            else if (min < 0)
                r = h <= max || h >= 360 + min;
            else // max > 359
                r = h >= min || h <= max - 360;
            //console.log([pixel, i, x, y, h, v, threshold, hue]);
            const v = r ? 0 : 255;
            return [v, v, v, pixel[3]];
        });
        dstCanvas.getContext('2d').putImageData(imageData, 0, 0);
        return dstCanvas;
    },

    /**
     * White Threshold
     * @param {?} srcCanvas Source image canvas
     * @param {number} threshold 0-255 Brightness threshold, above this turns white
     */
    whiteThreshold: (srcCanvas, threshold = 150) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);

        const imageData = mapCanvasPixels(srcCanvas, pixel => {
            const v = magicValues[0] * pixel[0] + magicValues[1] * pixel[1] + magicValues[2] * pixel[2];
            if (v >= threshold) {
                return [255, 255, 255, 255];
            } else {
                return [pixel[0], pixel[1], pixel[2], 255];
            }
        });

        dstCanvas.getContext('2d').putImageData(imageData, 0, 0);
        return dstCanvas;
    },

    /**
     * Convolute
     * @args[0]: Kernel, weighting matrix
     * @args[1]: Clamp, clamping method
     * @args[2]: Normalize, normalize output?
     * @args[3]: Opaque, consider transparency?
     */
    convolute: (srcCanvas, weights = [0, 0, 0, 0, 1, 0, 0, 0, 0], clamp = clampTypes[0], normalize = false, opaque = false) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);

        const imageData = convoluteCanvasPixels(srcCanvas, weights, clamp, normalize, opaque);

        dstCanvas.getContext('2d').putImageData(imageData, 0, 0);

        return dstCanvas;
    },

    /**
     * Sharpen
     * @args[0]: Clamp, clamping mehtod
     */
    sharpen: (srcCanvas, strength, clamp = clampTypes[0]) => {
        const a = -1 * strength,
            b = 5 * strength;

        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);

        let kernel = [
            0, a, 0,
            a, b, a,
            0, a, 0
        ];

        kernel = util.normalize(kernel);

        const imageData = convoluteCanvasPixels(srcCanvas, kernel, clamp);

        dstCanvas.getContext('2d').putImageData(imageData, 0, 0);
        return dstCanvas;
    },

    /**
     * Box Blur
     * @args[0]: Clamp, clamping mehtod
     */
    blur: (srcCanvas, sigma = 1, kernel_size = 3, clamp = clampTypes[0]) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);

        let mu = kernel_size / 2;
        let kernel = util.gaussianFunction2D(kernel_size, kernel_size, sigma, mu, mu);

        kernel = util.normalize(kernel);

        const imageData = convoluteCanvasPixels(srcCanvas, kernel, clamp);

        dstCanvas.getContext('2d').putImageData(imageData, 0, 0);
        return dstCanvas;
    },

    /**
     * Edge Detect
     * @args[0]: Clamp, clamping mehtod
     */
    edge: (srcCanvas, kernel_size, clamp = clampTypes[0]) => {
        const length = Math.pow(kernel_size * 2 + 1, 2),
            dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height),
            kernel = [];
        for (let i = 0; i < length; i++) {
            kernel.push(-1);
        }
        kernel[Math.floor(length / 2)] = length - 1;
        dstCanvas.getContext('2d').putImageData(convoluteCanvasPixels(srcCanvas, kernel, clamp), 0, 0);
        return dstCanvas;
    },

    /**
     * Negative / Inverse
     */
    negate: (srcCanvas) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height),
            context = dstCanvas.getContext('2d');
        context.drawImage(srcCanvas, 0, 0);
        context.globalCompositeOperation = 'difference';
        //if ($.browser.msie) {
        if (context.globalCompositeOperation == 'difference') {
            context.fillStyle = 'white';
            context.fillRect(0, 0, dstCanvas.width, dstCanvas.height);
        } else {
            dstCanvas.getContext('2d').putImageData(mapCanvasPixels(srcCanvas, pixel => {
                return [255 - pixel[0], 255 - pixel[1], 255 - pixel[2], pixel[3]];
            }), 0, 0);
        }
        return dstCanvas;
    },

    /**
     * Tint
     * @args[0]: RGB Color tint
     */
    tint: (srcCanvas, color=[255, 0, 0]) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height),
            context = dstCanvas.getContext('2d');
        context.drawImage(srcCanvas, 0, 0);
        context.globalCompositeOperation = 'lighter';
        if (context.globalCompositeOperation == 'lighter') {
            const fill = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            context.fillStyle = fill;
            context.fillRect(0, 0, dstCanvas.width,
            dstCanvas.height);
        } else {
            context.putImageData(mapCanvasPixels(srcCanvas, pixel => {
                return [pixel[0] + color[0], pixel[1] + color[1], pixel[2] + color[2], pixel[3]];
            }), 0, 0);
        }
        return dstCanvas;
    },

    adaptiveThreshold: (srcCanvas, threshold = 20, radius = 6) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);

        copyCanvasContent(srcCanvas, dstCanvas);

        const dstContext = dstCanvas.getContext('2d');

        let img_u8 = new jsfeat.matrix_t(srcCanvas.width, srcCanvas.height, jsfeat.U8_t | jsfeat.C1_t);

        let imageData = dstContext.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

        jsfeat.imgproc.grayscale(imageData.data, srcCanvas.width, srcCanvas.height, img_u8);

        let ii_sum = new Int32Array((img_u8.cols + 1) * (img_u8.rows + 1));

        jsfeat.imgproc.compute_integral_image(img_u8, ii_sum);

        const t = threshold;

        for (let y = img_u8.rows; y >= 0; y--) {
            for (let x = img_u8.cols - 1; x >= 0; x--) {
                //img_u8.data[i] = img_u8.data[i] > (getAvg(x, y) + t) ? 0xff : 0;
                const x1 = Math.max(x - radius, 0);
                const x2 = Math.min(x + radius, img_u8.cols);
                const y1 = Math.max(y - radius, 0);
                const y2 = Math.min(y + radius, img_u8.rows);
                const count = (x2 - x1) * (y2 - y1);
                const sum = ii_sum[x2 + y2 * (img_u8.cols + 1)] -
                    ii_sum[x2 + y1 * (img_u8.cols + 1)] -
                    ii_sum[x1 + y2 * (img_u8.cols + 1)] +
                    ii_sum[x1 + y1 * (img_u8.cols + 1)];
                img_u8.data[x + y * img_u8.cols] = img_u8.data[x + y * img_u8.cols] > (t / 255) * sum / count ? 255 : 0;
            }
        }

        util.u8ToImageData(imageData, img_u8);

        dstContext.putImageData(imageData, 0, 0);

        return dstCanvas;
    },

    equalizeHistogram: (srcCanvas) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);

        copyCanvasContent(srcCanvas, dstCanvas);

        const dstContext = dstCanvas.getContext('2d');

        let img_u8 = new jsfeat.matrix_t(srcCanvas.width, srcCanvas.height, jsfeat.U8_t | jsfeat.C1_t);

        let imageData = dstContext.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

        jsfeat.imgproc.grayscale(imageData.data, srcCanvas.width, srcCanvas.height, img_u8);

        jsfeat.imgproc.equalize_histogram(img_u8, img_u8);

        util.u8ToImageData(imageData, img_u8);

        dstContext.putImageData(imageData, 0, 0);

        return dstCanvas;
    },

    gaussianBlur: (srcCanvas, kernel_size, sigma) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);

        copyCanvasContent(srcCanvas, dstCanvas);

        const dstContext = dstCanvas.getContext('2d');

        let img_u8 = new jsfeat.matrix_t(srcCanvas.width, srcCanvas.height, jsfeat.U8_t | jsfeat.C1_t);

        let imageData = dstContext.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

        jsfeat.imgproc.grayscale(imageData.data, srcCanvas.width, srcCanvas.height, img_u8);

        jsfeat.imgproc.gaussian_blur(img_u8, img_u8, kernel_size, sigma);

        util.u8ToImageData(imageData, img_u8);

        dstContext.putImageData(imageData, 0, 0);

        return dstCanvas;
    },

    outline: (srcCanvas, lowThreshold = 1, highThreshold = 250) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);

        copyCanvasContent(srcCanvas, dstCanvas);

        const dstContext = dstCanvas.getContext('2d');

        let img_u8 = new jsfeat.matrix_t(srcCanvas.width, srcCanvas.height, jsfeat.U8_t | jsfeat.C1_t);

        let imageData = dstContext.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

        jsfeat.imgproc.grayscale(imageData.data, srcCanvas.width, srcCanvas.height, img_u8);

        jsfeat.imgproc.canny(img_u8, img_u8, lowThreshold, highThreshold);

        util.u8ToImageData(imageData, img_u8);

        dstContext.putImageData(imageData, 0, 0);

        return dstCanvas;
    },

    /**
     * Transparent
     * @args[0]: ColorKey, Color to replace with transparency
     * @args[1]: ColorThreshold, (0-255) Deviation from colorKey to treat as transparent
     */
    makeTransparent: (srcCanvas, colorKey = [255, 255, 255, 255], colorThreshold = 5) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);

        const imageData = mapCanvasPixels(srcCanvas, pixel => {
            const rPass = Math.abs(pixel[0] - colorKey[0]) <= colorThreshold;
            const gPass = Math.abs(pixel[1] - colorKey[1]) <= colorThreshold;
            const bPass = Math.abs(pixel[2] - colorKey[2]) <= colorThreshold;
            const aPass = Math.abs(pixel[3] - colorKey[3]) <= colorThreshold;

            if (rPass && gPass && bPass && aPass) {
                return [pixel[0], pixel[1], pixel[2], 0];
            } else {
                return pixel;
            }
        });

        dstCanvas.getContext('2d').putImageData(imageData, 0, 0);
        return dstCanvas;
    },

    /** Reflect
     * @args[0] - {Boolean} Reflect horizontal
     * @args[1] - {Boolean}  Reflect vertical
     * @args[2] - [x, y] scale spacing between reflections
     */
    reflect: (srcCanvas, horizontal = true, vertical = true, spacing = [0, 0]) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);

        spacing = [(horizontal) ? spacing[0] : 0, (vertical) ? spacing[1] : 0];

        const finalSize = [(horizontal ? 2 : 1) * srcCanvas.width + (spacing[0] * srcCanvas.width), (vertical ? 2 : 1) * srcCanvas.height + (spacing[1] * srcCanvas.height)];

        dstCanvas.width = finalSize[0];
        dstCanvas.height = finalSize[1];
        const dstContext = dstCanvas.getContext('2d');

        let sourceCanvas = srcCanvas;

        if (spacing[0] < 0 || spacing[1] < 0) {
            sourceCanvas = effects.makeTransparent(srcCanvas, [255, 255, 255, 255], 50);
            dstContext.clearRect(0, 0, dstCanvas.width, dstCanvas.height);
        }

        dstContext.drawImage(sourceCanvas, 0, 0);

        dstContext.save();

        // draw horizontal flipped image
        if (horizontal) {
            dstContext.save();
            dstContext.translate((finalSize[0] / 2) + (spacing[0] * srcCanvas.width / 2), 0);
            dstContext.scale(-1, 1);
            dstContext.drawImage(sourceCanvas, -srcCanvas.width, 0);
            dstContext.restore();
        }

        // draw vertical flipped image
        if (vertical) {
            dstContext.save();
            dstContext.translate(0, (finalSize[1] / 2) + (spacing[1] * srcCanvas.height / 2));
            dstContext.scale(1, -1);
            dstContext.drawImage(sourceCanvas, 0, -srcCanvas.height);
            dstContext.restore();
        }

        // draw vertical+horizontal flipped image
        if (vertical && horizontal) {
            dstContext.save();
            dstContext.translate((finalSize[0] / 2) + (spacing[0] * srcCanvas.width / 2), (finalSize[1] / 2) + (spacing[1] * srcCanvas.height / 2));
            dstContext.scale(-1, -1);
            dstContext.drawImage(sourceCanvas, -srcCanvas.width, -srcCanvas.height);
            dstContext.restore();
        }

        dstContext.restore();
        return dstCanvas;
    },


    /** Bend
     * @args[0] - {number} Offset, vertical offset of image bend in pixels
     */
    bend: (srcCanvas, offset = 15) => {
        const x1 = srcCanvas.width * 0.5;
        const y2 = 0;

        // basic
        const eb = (y2 * x1 * x1 - offset * srcCanvas.width * srcCanvas.width) / (srcCanvas.width * x1 * x1 - x1 * srcCanvas.width * srcCanvas.width);
        const ea = (offset - eb * x1) / (x1 * x1);


        let canvasYOff = 0;
        if (offset < 0) {
            canvasYOff = offset;
        }

        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height + Math.abs(offset));
        const dstContext = dstCanvas.getContext('2d');

        dstContext.drawImage(srcCanvas, 0, 0);

        let imageData = dstCanvas.getContext('2d').getImageData(0, 0, dstCanvas.width, dstCanvas.height);
        let dst = imageData.data;
        let src = new Uint8ClampedArray(dst);

        if (offset !== 0) {
            for (let x = 0; x < srcCanvas.width; x++) {
                const currentYOffset = Math.ceil(((ea * x * x) + eb * x) - canvasYOff);
                // const currentYOffset = Math.ceil(((eb * x * x) * (eb * x) + 1 * x) - canvasYOff);
                const currentMaxY = srcCanvas.height + currentYOffset;
                for (let y = 0; y < currentYOffset; y++) {
                    const i = util.getIndexAt(x, y, srcCanvas.width);

                    dst[i] = 255;
                    dst[i + 1] = 255;
                    dst[i + 2] = 255;
                    dst[i + 3] = 255;
                }
                for (let y = currentYOffset; y < currentMaxY; y++) {
                    const offsetIndex = util.getIndexAt(x, y, srcCanvas.width);
                    const srcY = Math.round(util.map_range(y, currentYOffset, currentMaxY, 0, srcCanvas.height));
                    const srcIndex = util.getIndexAt(x, srcY, srcCanvas.width);

                    dst[offsetIndex] = src[srcIndex];
                    dst[offsetIndex + 1] = src[srcIndex + 1];
                    dst[offsetIndex + 2] = src[srcIndex + 2];
                    dst[offsetIndex + 3] = src[srcIndex + 3];
                }
                for (let y = currentMaxY; y < srcCanvas.height; y++) {
                    const i = util.getIndexAt(x, y, srcCanvas.width);

                    dst[i] = 255;
                    dst[i + 1] = 255;
                    dst[i + 2] = 255;
                    dst[i + 3] = 255;
                }
            }
        }

        dstContext.putImageData(imageData, 0, 0);

        return dstCanvas;
    },

    
    /** Bend2
     * @args[0] - {number} offsetTop, vertical offset of top of image bend in pixels
     * @args[1] - {number} offsetBot, vertical offset of bottom of image bend in pixels
     * @args[2] - {number} thicknessScale, vertical scaling to adjust for squishing due to offsets (1.0 = original size)
     */
    bend2: (srcCanvas, offsetTop = 15, offsetBot = 15, thicknessScale = 1.0) => {
        const x1 = srcCanvas.width * 0.5;
        const y2 = 0;

        const eb1 = (y2 * x1 * x1 - offsetTop * srcCanvas.width * srcCanvas.width) / (srcCanvas.width * x1 * x1 - x1 * srcCanvas.width * srcCanvas.width);
        const ea1 = (offsetTop - eb1 * x1) / (x1 * x1);

        const eb2 = (y2 * x1 * x1 - offsetBot * srcCanvas.width * srcCanvas.width) / (srcCanvas.width * x1 * x1 - x1 * srcCanvas.width * srcCanvas.width);
        const ea2 = (offsetBot - eb2 * x1) / (x1 * x1);

        let canvasYOffA = 0;
        let canvasYOffB = 0;
        if (offsetTop < 0) {
            canvasYOffA = offsetTop;
        }

        let note = 0;
        let botMod = 0;
        if (offsetTop <= 0) {
            if (Math.abs(offsetTop) < offsetBot) {
                botMod = offsetTop + offsetBot;
            }
        } else {
            if (offsetBot > 0) {
                botMod = offsetBot;
            } else if (offsetBot < 0) {
                if (Math.abs(offsetBot) < offsetTop) {
                    botMod = offsetBot;
                    note = 'offsetBot'
                } else {
                    botMod = -offsetTop;
                }
            }
        }

        let finalHeightMod = Math.abs(offsetTop) + botMod;

        const dstCanvas = createCanvas(srcCanvas.width, (srcCanvas.height * thicknessScale) + finalHeightMod);
        const dstContext = dstCanvas.getContext('2d');

        dstContext.drawImage(srcCanvas, 0, 0);

        let imageData = dstCanvas.getContext('2d').getImageData(0, 0, dstCanvas.width, dstCanvas.height);
        let dst = imageData.data;
        let src = new Uint8ClampedArray(dst);

        // clear dst since we've copied image data
        for (let i = 0; i < dst.length; i++) {
            dst[i] = 255;
        }

        if (offsetTop !== 0 || offsetBot !== 0) {
            for (let x = 0; x < srcCanvas.width; x++) {
                const yOffA = Math.round(((ea1 * x * x) + eb1 * x) - canvasYOffA);
                const yOffB = Math.round(((ea2 * x * x) + eb2 * x));

                const currentMaxY = yOffA + (srcCanvas.height * thicknessScale) + yOffB;
                for (let y = yOffA; y < currentMaxY; y++) {
                    const offsetIndex = util.getIndexAt(x, y, srcCanvas.width);
                    const srcY = Math.round(util.map_range(y, yOffA, currentMaxY, 0, srcCanvas.height));
                    const srcIndex = util.getIndexAt(x, srcY, srcCanvas.width);

                    dst[offsetIndex] = src[srcIndex];
                    dst[offsetIndex + 1] = src[srcIndex + 1];
                    dst[offsetIndex + 2] = src[srcIndex + 2];
                    dst[offsetIndex + 3] = src[srcIndex + 3];
                }
            }
        }

        dstContext.putImageData(imageData, 0, 0);

        return dstCanvas;
    },


    /** Arc
     * @args[0] - Angle, angle of arc
     * @args[1] - Rotate, rotation of arc
     */
    arc: (srcCanvas, angle = 360, innerRadius = undefined) => {
        const PI2 = Math.PI * 2;

        let outerRadius = srcCanvas.height;         // exclusive outer circle radius

        innerRadius = (innerRadius !== undefined) ? innerRadius : Math.ceil(srcCanvas.height * 0.5);        // inner circle radius

        const scaling = 1;

        innerRadius *= scaling;
        outerRadius *= scaling;

        const totalRadius = innerRadius + outerRadius;  // full circle radius
        
        const arcDegrees = angle;       // degrees of completeness
        const arcRadians = util.degToRad(Math.abs(arcDegrees));

        // calculate rotation range
        let thetaMin = -Math.PI + (Math.PI - arcRadians / 2);
        let thetaMax = Math.PI - (Math.PI - arcRadians / 2);

        let finalWidth = totalRadius * 2;
        let finalHeight = totalRadius * 2;

        let rightmost = 0;
        let bottommost = 0;

        let flipped = false;
        
        if (angle === 0) { 
            return srcCanvas;
        }

        if (angle > 0) {
            if ( angle >= 180 ) {
                rightmost = util.polarToCartesian([-totalRadius, thetaMax])[0] + totalRadius;
                bottommost = totalRadius * 2;
            } else {
                rightmost = util.polarToCartesian([-innerRadius, thetaMax])[0] + totalRadius;
                bottommost = util.polarToCartesian([totalRadius * 2, thetaMax])[1];
            }
        } else if (angle < 0) {
            flipped = true;
            if ( angle <= -180 ) {
                rightmost = util.polarToCartesian([-totalRadius, thetaMax])[0] + totalRadius;
                bottommost = totalRadius * 2;
            } else {
                rightmost = util.polarToCartesian([-innerRadius, thetaMax])[0] + totalRadius;
                bottommost = util.polarToCartesian([totalRadius * 2, thetaMax])[1];
            }
        }
        
        const srcCenter = [srcCanvas.width / 2, srcCanvas.height / 2];

        const wholeSize = [finalWidth, finalHeight];
        const wholeCenter = [wholeSize[0] / 2, wholeSize[1] / 2];

        const finalSize = [Math.round(rightmost), Math.round(bottommost)];

        const unscaledFinalSize = [finalSize[0] / scaling, finalSize[1] / scaling];

        const finalCenter = [finalSize[0] / 2, finalSize[1] / 2];

        const src = srcCanvas.getContext('2d').getImageData(0, 0, srcCanvas.width, srcCanvas.height).data;

        // holds pre-rotated image
        const tmpCanvas = createCanvas(finalSize[0], finalSize[1]);
        const imageData = tmpCanvas.getContext('2d').getImageData(0, 0, finalSize[0], finalSize[1]);

        // final canvas size should have an area very near the source
        const areaCorrectedFinalSize = util.getProportionallyLimitedArea(unscaledFinalSize, srcCanvas.width * srcCanvas.height, true);
        areaCorrectedFinalSize[0] = Math.round(areaCorrectedFinalSize[0]);
        areaCorrectedFinalSize[1] = Math.round(areaCorrectedFinalSize[1]);

        // holds final image
        const dstCanvas = createCanvas(areaCorrectedFinalSize[1], areaCorrectedFinalSize[0]);
        const dstContext = dstCanvas.getContext('2d');

        let dst = imageData.data;
        for (let dx = 0; dx < finalSize[0]; dx++) {
            for (let dy = 0; dy < finalSize[1]; dy++) {
                const di = util.getIndexAt(dx, dy, finalSize[0]);
                
                const cx = dx - finalCenter[0] + ((finalWidth - rightmost) / 2);
                const cy = dy - finalCenter[1];

                // calculate radius and theta for the pixel at (cx, cy)
                const radius = Math.sqrt(cx * cx + cy * cy);
                const theta = Math.atan2(cy, cx);

                // if in radius and theta
                if (radius >= innerRadius && radius <= totalRadius && theta >= thetaMin && theta <= thetaMax) {
                    // map x to theta progress
                    const srcMin = [0, 0];
                    const srcMax = [srcCanvas.width, srcCanvas.height];

                    const sx = flipped ?
                         Math.floor(util.map_range(theta, thetaMin, thetaMax, srcMax[0], srcMin[0])) : Math.floor(util.map_range(theta, thetaMin, thetaMax, srcMin[0], srcMax[0]));

                    // map y to radius progress
                    const sy = flipped ? 
                        Math.floor(util.map_range(radius, innerRadius, totalRadius, srcMin[1], srcMax[1])) : Math.floor(util.map_range(radius, innerRadius, totalRadius, srcMax[1], srcMin[1]));

                    // get source index
                    const si = util.getIndexAt(sx, sy, srcCanvas.width);

                    // sample source pixel for this dest pixel
                    dst[di] = src[si];
                    dst[di + 1] = src[si + 1];
                    dst[di + 2] = src[si + 2];
                    dst[di + 3] = src[si + 3];

                }
            }
        }

        tmpCanvas.getContext('2d').putImageData(imageData, 0, 0);

        
        dstContext.save();

        // for scaling tmpCanvas down to final size
        const rescale = util.getProportionallyLimitedAreaScale([tmpCanvas.width, tmpCanvas.height], dstCanvas.width * dstCanvas.height - 2, true);

        dstContext.scale(rescale, rescale);

        // dstContext.restore();

        if (flipped) {
            dstContext.rotate(util.degToRad(-270));
            dstContext.translate(0, -bottommost);
        } else {
            dstContext.rotate(util.degToRad(-90));
            dstContext.translate(-rightmost, 0);
        }


        dstContext.drawImage(tmpCanvas, 0, 0);
        dstContext.restore();

        const srcArea = srcCanvas.width * srcCanvas.height;
        const dstArea = dstCanvas.width * dstCanvas.height;

        //console.clear();
        //console.log('Source Area\t\t\t', srcArea);
        //console.log('Destination Area\t', dstArea);
        //console.log('Error Margin\t\t', Math.abs(srcArea - dstArea));
        
        return dstCanvas;
    },

    /** Resize
     * @args[0] - Size, new size
     * @args[1] - keepRatio, toggle to resize only based on new width
     */
    resize: (srcCanvas, targetSize = [256, 256], keepRatio = true) => {
        if (srcCanvas.width === 0 || srcCanvas.height === 0 || targetSize[0] === 0 || targetSize[1] === 0) {
            return srcCanvas;
        }

        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);

        let finalSize = (keepRatio) ? [targetSize[0], (srcCanvas.height / srcCanvas.width) * targetSize[0]] : targetSize;

        dstCanvas.width = finalSize[0];
        dstCanvas.height = finalSize[1];

        dstCanvas.getContext('2d').drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, finalSize[0], finalSize[1]);

        return dstCanvas;
    },
    
    limitArea: (srcCanvas, maxArea=undefined, enlargeToLimit=false) => {
        const size = util.getProportionallyLimitedArea([srcCanvas.width, srcCanvas.height], maxArea, enlargeToLimit);
        if (size[0] == srcCanvas.width && size[1] == srcCanvas.height) {
            return srcCanvas;
        } else {
            const dstCanvas = createCanvas(size[0], size[1]);
            dstCanvas.getContext('2d').drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, size[0], size[1]);
            return dstCanvas;
        }
    },

    border: (srcCanvas, color='white', size=1) => {
        const dstCanvas = createCanvas(srcCanvas.width + size * 2, srcCanvas.height + size * 2);
        const context = dstCanvas.getContext('2d');
        context.fillStyle = color;
        context.fillRect(0, 0, dstCanvas.width, dstCanvas.height);
        context.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, size, size, srcCanvas.width, srcCanvas.height);
        return dstCanvas;
    },
    
    /** Crop
     * @args[0] - Size, new size
     * @args[1] - Origin, top left corner to apply size from
     * @args[2] - keepRatio, toggle to resize only based on new width
     */
    crop: (srcCanvas, targetSize, cropOrigin = [0, 0], keepRatio = true) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);
        let finalSize;

        if (srcCanvas.width === 0 || srcCanvas.height === 0 || (targetSize && (targetSize[0] === 0 || targetSize[1] === 0)))
            return;
        
        if (targetSize)
            finalSize = (keepRatio) ? [targetSize[0], (srcCanvas.height / srcCanvas.width) * targetSize[0]] : targetSize;
        else {
            const guessedRect = guessImgDataCropRect(srcCanvas.getContext('2d').getImageData(0, 0, srcCanvas.width, srcCanvas.height));
            finalSize = guessedRect.slice(2);
            cropOrigin = guessedRect.slice(0, 2);
        }

        dstCanvas.width = finalSize[0];
        dstCanvas.height = finalSize[1];

        dstCanvas.getContext('2d').drawImage(srcCanvas, cropOrigin[0], cropOrigin[1], finalSize[0], finalSize[1], 0, 0, finalSize[0], finalSize[1]);
        
        return dstCanvas;
    },

    /** Flatten
     *  
     */
    flatten: (srcCanvas) => {
        const dstCanvas = createCanvas(srcCanvas.width, srcCanvas.height);
        /*const imageData = mapCanvasPixels(srcCanvas, pixel => { // slow
            const a = pixel[3] / 255;
            const b = (1 - a) * 255;
            return [a * pixel[0] + b, a * pixel[1] + b, a * pixel[2] + b, 255];
        });
        dstCanvas.getContext('2d').putImageData(imageData, 0, 0);*/
        clearCanvas(dstCanvas); // this gets the transparency to be removed
        dstCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);
        return dstCanvas;
    }
};

/**
 * Util
 * #Utility functions used by effects
 */
const util = {
    // Maps a given value with its provided range between another provided range
    map_range: (value, low1, high1, low2, high2) => {
        return low2 + (high2 - low2) * (value - low1) / (high1 - low1);
    },

    clamp: (value, min, max) => {
        if (value < min) {
            return min;
        }
        if (value > max) {
            return max;
        }
        return value;
    },

    degToRad: (degrees) => {
        return (degrees * Math.PI / 180);
    },

    radToDeg: (radians) => {
        return (radians * 180 / Math.PI);
    },

    /**
     * @param {[number, number]} coord XY coordinates
     * @returns {[number, number]} [radius, theta]
     */
    cartesianToPolar: (coord) => {
        return [Math.sqrt(coord[0] * coord[0] + coord[1] * coord[1]), Math.atan2(coord[1], coord[0])];
    },

    /**
     * @param {[number, number]} coord Polar Coordinates [radius, theta]
     * @returns {[number, number]} Grid coordinates [x, y]
     */
    polarToCartesian: (coord) => {
        return [coord[0] * Math.cos(coord[1]), coord[0] * Math.sin(coord[1])];
    },

    forwardMap: (dx, dy, dxMin, dxMax, dyMin, dyMax) => {
        let res = [];
        res[0] = Math.min(dxMin, dx);
        res[1] = Math.max(dxMax, dx);
        res[2] = Math.min(dyMin, dy);
        res[3] = Math.max(dyMax, dy);
        return res;
    },

    getProportionallyLimitedAreaScale: (size, maxArea = Math.pow(2000, 2), enlargeToLimit = false) => {
        const area = parseFloat(size[0]) * parseFloat(size[1]);
        if (area <= 0)
            return [0, 0];
        let k = Math.sqrt(maxArea / area);
        if (!enlargeToLimit)
            k = Math.min(k, 1);
        return k;
    },

    getProportionallyLimitedArea: (size, maxArea = Math.pow(2000, 2), enlargeToLimit = false) => {
        const k = util.getProportionallyLimitedAreaScale(size, maxArea, enlargeToLimit);
        return [k * size[0], k * size[1]].map(Math.floor); // can't use ceil because it can round to over limit
    },

    // assumes hsv are in the set [0, 1]
    // assumes rgb are in the set [0, 255]
    rgbToHsv: (r, g, b) => {
        r /= 255;
        g /= 255;
        b /= 255;

        let max = Math.max(r, g, b),
            min = Math.min(r, g, b);

        let v = max;

        let d = max - min;

        let s = (max == 0) ? 0 : d / max;

        let h;
        if (max == min) {
            h = 0;
        } else {
            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
                    break;
            }

            h /= 6;
        }

        return [h, s, v];
    },

    // assumes hsv are in the set [0, 1]
    // assumes rgb are in the set [0, 255]
    hsvToRgb: (h, s=1, v=1) => {
        const i = Math.floor(h * 6),
            f = h * 6 - i,
            p = v * (1 - s),
            q = v * (1 - f * s),
            t = v * (1 - (1 - f) * s);
        let r, g, b;

        switch (i % 6) {
            case 0:
                r = v, g = t, b = p;
                break;
            case 1:
                r = q, g = v, b = p;
                break;
            case 2:
                r = p, g = v, b = t;
                break;
            case 3:
                r = p, g = q, b = v;
                break;
            case 4:
                r = t, g = p, b = v;
                break;
            case 5:
                r = v, g = p, b = q;
                break;
        }

        return [r * 255, g * 255, b * 255].map(Math.round);
    },

    normalize: (array) => {
        const sum = array.reduce((a, b) => a + b);
        return array.map(i => i / sum);
    },

    getPixelAt: (x, y, width) => {
        const i = util.getIndexAt(x, y, width);
        return [i, i + 1, i + 2, i + 3];
    },

    getIndexAt: (x, y, width) => {
        return (y * width + x) * 4;
    },

    /** Pixel Clamp
     * @args [x, y] pixels 
     * @args [width, height] size 
     * @args [x, y] sample
     * @args ['REPEAT', 'REFLECT', 'WRAP'] clampType
     * @args returns An index to sample from (can be -1 if set to constant)
     */
    getClampedPixel: (pixels, size, sample, type = clampTypes[0]) => {
        let clamped = [sample[0], sample[1]];

        switch (type) {
            case 'REPEAT':
                if (sample[0] < 0) {
                    clamped[0] = 0;
                } else if (sample[0] >= size[0]) {
                    clamped[0] = size[0] - 1;
                }

                if (sample[1] < 0) {
                    clamped[1] = 0;
                } else if (sample[1] >= size[1]) {
                    clamped[1] = size[1] - 1;
                }
                break;
            case 'REFLECT':
                if (sample[0] < 0) {
                    clamped[0] = -1 * sample[0];
                } else if (sample[0] >= size[0]) {
                    clamped[0] = size[0] - (sample[0] - size[0]);
                }

                if (sample[1] < 0) {
                    clamped[1] = -1 * sample[1];
                } else if (sample[1] >= size[1]) {
                    clamped[1] = size[1] - (sample[1] - size[1]);
                }
                break;
            case 'WRAP':
                if (sample[0] < 0) {
                    clamped[0] = size[0] + sample[0];
                } else if (sample[0] >= size[0]) {
                    clamped[0] = sample[0] - size[0];
                }

                if (sample[1] < 0) {
                    clamped[1] = size[1] + sample[1];
                } else if (sample[1] >= size[1]) {
                    clamped[1] = sample[1] - size[1];
                }
                break;
            case 'WHITE':
                if (sample[0] < 0 || sample[0] >= size[0] || sample[1] < 0 || sample[1] >= size[1]) {
                    return [255, 255, 255, 255];
                }
                break;
            case 'BLACK':
                if (sample[0] < 0 || sample[0] >= size[0] || sample[1] < 0 || sample[1] >= size[1]) {
                    return [0, 0, 0, 255];
                }
                break;
            default:
                return util.getClampedPixel(pixels, size, sample);
        }

        const index = util.getIndexAt(clamped[0], clamped[1], size[0]);
        return [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]];
    },

    u8ToImageData: (imageData, img_u8) => {
        let data_u32 = new Uint32Array(imageData.data.buffer);

        let alpha = (0xff << 24);

        let i = img_u8.cols * img_u8.rows,
            pix = 0;
        while (--i >= 0) {
            pix = img_u8.data[i];
            data_u32[i] = alpha | (pix << 16) | (pix << 8) | pix;
        }
    },

    gaussianFunction2D: (rows, cols, sigma, mux, muy) => {
        let matrix = [rows * cols];
        for (let x = 0; x < cols; x++) {
            for (let y = 0; y < rows; y++) {
                let fnA = (1 / (2 * Math.PI * sigma * sigma));

                let fnB = Math.pow(x - mux, 2) + Math.pow(y - muy, 2);
                let fnC = -1 * fnB / Math.pow(2 * sigma, 2);

                let fnD = fnA * Math.pow(Math.E, fnC);

                matrix[y * cols + x] = fnD;
            }
        }

        return matrix;
    },

    /**
     * @param {[number, number]} a first polar coordinate [radius, theta]
     * @param {[number, number]} b second polar coordinate [radius, theta]
     * @returns {number} distance between these points
     */
    polarDistance: (a, b) => {
        a = util.fixPolarCoordinate(a);
        b = util.fixPolarCoordinate(b);

        return Math.sqrt((a[0] * a[0]) + (b[0] * b[0]) - (2 * a[0] * b[0]) * Math.cos(b[1] - a[1]));
    },

    /**
     * @param {[number, number]} coord polar coordinates  [radius, theta]
     * @returns {[number, number]} polar coordinates [radius, theta]
     */
    fixPolarCoordinate: (coord) => {
        if (coord[0] < 0) {
            coord[0] = -1 * coord[0];
        }

        if (coord[1] < 0) {
            coord[1] += 360;
        } else if (coord[1] > 360) {
            coord[1] -= 360;
        }

        return coord;
    }
};

function applyEffect(srcCanvas, effectName, effectArgs = []) {
    return effects[effectName].apply(null, [srcCanvas].concat(effectArgs));
}

function transformImage(origImgOrCanvas, effects, dstCanvas = undefined) {
    let lastCanvas = origImgOrCanvas instanceof HTMLImageElement ? createCanvasFromImage(origImgOrCanvas) : origImgOrCanvas;
    effects.forEach(fx => {
        lastCanvas = applyEffect(lastCanvas, fx[0], fx[1]);
    });
    if (dstCanvas) {
        clearCanvas(dstCanvas);
        copyCanvasContent(lastCanvas, dstCanvas);
    }
    return lastCanvas;
}

function copyCanvasContent(srcCanvas, dstCanvas) {
    dstCanvas.width = srcCanvas.width;
    dstCanvas.height = srcCanvas.height;
    dstCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);
}

function drawImageToCanvas(canvas, image, useCanvasSize = false, clear = false) {
    const context = canvas.getContext('2d');

    if (clear) {
        clearCanvas(canvas);
    }

    if (!useCanvasSize) {
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
    }

    context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, image.naturalWidth, image.naturalHeight);
    return canvas;
}

function createCanvasFromImage(img) {
    return drawImageToCanvas(createCanvas(img.naturalWidth, img.naturalHeight), img, false, true);
}

function clearCanvas(canvas, fill = '#FFF') {
    // has the benefit of getting rid of troublesome transparency in the orig img and in new canvases
    const context = canvas.getContext('2d');
    context.beginPath();
    context.fillStyle = fill;
    context.rect(0, 0, canvas.width, canvas.height);
    context.fill();
}

function createCanvas(width = 0, height = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function mapCanvasPixels(canvas, callbackFn) {
    const context = canvas.getContext('2d'),
        imageData = context.getImageData(0, 0, canvas.width, canvas.height),
        dst = imageData.data,
        src = new Uint8ClampedArray(dst);

    if (!Uint8ClampedArray.prototype.slice) // IE missing Uint8ClampedArray.slice
        Object.defineProperty(Uint8ClampedArray.prototype, 'slice', {value: Array.prototype.slice});

    for (let x = canvas.width - 1; x >= 0; --x) {
        for (let y = canvas.height - 1; y >= 0; --y) {
            // - deskpecle is the only functino that uses any param other than the pixel value; for spped would be nice to make that a sepcial case, and presumably nothing uses the index param
            let i = (y * canvas.width + x) * 4;
            const newPixel = callbackFn(src.slice(i, i + 4), i, x, y);
            dst[i] = newPixel[0];
            dst[++i] = newPixel[1];
            dst[++i] = newPixel[2];
            dst[++i] = newPixel[3];
        }
    }
    return imageData;
}

function convoluteCanvasPixels(canvas, weights, clamp = clampTypes[0], norm = false, opaque = true) {
    const srcContext = canvas.getContext('2d'),
        src = srcContext.getImageData(0, 0, canvas.width, canvas.height).data,
        //dst = imageData.data,
        //src = new Uint8ClampedArray(dst), // makes copy
        side = Math.sqrt(weights.length),
        halfSide = Math.floor(side / 2),
        croppedSize = [canvas.width - halfSide * 2, canvas.height - halfSide * 2],
        //dst = new Uint8ClampedArray(croppedSize[0] * croppedSize[1] * 4);
        dstData = srcContext.createImageData(croppedSize[0], croppedSize[1]), // works in IE
        dst = dstData.data;

    let alphaFac = opaque ? 1 : 0;
    if (norm) {
        weights = util.normalize(weights);
    }

    //for (let y = canvas.height - 1; y >= 0; --y) {
        //for (let x = canvas.width - 1; x >= 0; --x) {
    for (let y = croppedSize[1] - 1; y >= 0; --y) { // crop image by half width of matrix so dont have to slow it down with clamping in innermost loop
        for (let x = croppedSize[0] - 1; x >= 0; --x) {
            let r = 0,
                g = 0,
                b = 0,
                a = 0;
            let iWeights = weights.length;
            for (let cy = side - 1; cy >= 0; --cy) {
                for (let cx = side - 1; cx >= 0; --cx) {
                    //const scx = x + (cx - halfSide), scy = y + (cy - halfSide);
                    //const weight = weights[cy * side + cx];
                    //const clampedPixeli = (canvas.width * util.clamp(y + (cy - halfSide), 0, canvas.height - 1) + util.clamp(x + (cx - halfSide), 0, canvas.width - 1)) * 4;
                    //r += src[(canvas.width * util.clamp(y + (cy - halfSide), 0, canvas.height - 1) + util.clamp(x + (cx - halfSide), 0, canvas.width - 1)) * 4;] * weights[--iWeights/*cy * side + cx*/];
                    r += src[(canvas.width * (y + cy) + (x + cx)) * 4] * weights[--iWeights/*cy * side + cx*/];
                    // i'd only use this on grayscale images so just assume that for speed
                    //g += src[clampedPixeli + 1] * weight;
                    //b += src[clampedPixeli + 2] * weight;

                    /*
                    let clampedPixel = util.getClampedPixel(src, [canvas.width, canvas.height], [scx, scy], clamp);

                    r += clampedPixel[0] * wt;
                    g += clampedPixel[1] * wt;
                    b += clampedPixel[2] * wt;
                    a += clampedPixel[3] * wt;
                    */
                }
            }
            let dstOff = (y * croppedSize[0] + x) * 4;
            dst[dstOff] = r;
            dst[++dstOff] = r;//g;
            dst[++dstOff] = r;//b;
            dst[++dstOff] = 255;
            //dst[dstOff + 3] = a + alphaFac * (255 - a);
        }
    }
    return dstData;//new ImageData(dst, croppedSize[0], croppedSize[1]); // IE doesn't support new ImageData
}

function guessImgDataCropRect( /*img*/ data, threshold=255) {
    // returns [left, top, width, height]

    //var data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
    
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

function rasterizeSvgToCanvas(svg, callback, area = Math.pow(2000, 2)) {
    // concerts svg string into a canvas
    const xml = $($.parseXML(svg)).find('svg').first();
    let fittedSvg;
    if (xml) {
        const size = [xml.attr('width'), xml.attr('height')].map(parseFloat);
        if ((_.all || _.every)(size)) { // - else get from viewBox if any?
            const fittedSize = proportionallyLimitArea(size, area, true); // - ideally fit exactly inside canvas size
            xml.attr('width', fittedSize[0]);
            xml.attr('height', fittedSize[1]);
            fittedSvg = new XMLSerializer().serializeToString(xml[0]);
        }
    }
    const canvas = document.createElement('canvas');
    canvgLazy(
        canvas,
        fittedSvg || svg,
        {
            renderCallback: function() {
                callback(canvas);
                //canvas.toBlob(callback);
            }
        }
    );
}


// var srcCanvas = document.getElementById('srcImg');
// var img = new Image();
// img.setAttribute('crossOrigin', '');

// img.onload = () => {


//     var destCanvas = effects.greyscale(img)

    
   

//     destCanvas = effects.negate(destCanvas)

//     destCanvas = effects.edge(destCanvas, 2)

//     destCanvas = effects.threshold(destCanvas)

//     destCanvas = effects.negate(destCanvas)


    
//     document.body.appendChild(destCanvas)
// }

// img.src = "https://static05.jockey.in/uploads/dealimages/8670/detailimages/orange-and-navy-boys-striped-t-shirt-ab09-4.jpg"




function getContour(imgURI)
{
    var img = new Image();
    img.setAttribute('crossOrigin', '');
    img.onload = () => {

    var destCanvas = effects.greyscale(img)

    

    destCanvas = effects.negate(destCanvas)

    destCanvas = effects.edge(destCanvas, 2)

    destCanvas = effects.threshold(destCanvas)

    destCanvas = effects.negate(destCanvas)

    exportCanvasAsPNG(destCanvas, "contourImg.png")
    // document.body.appendChild(destCanvas)

    }
    img.src = imgURI

    
}

function exportCanvasAsPNG(canvasElement, fileName) {


    var MIME_TYPE = "image/png";

    var imgURL = canvasElement.toDataURL(MIME_TYPE);

    var dlLink = document.createElement('a');
    dlLink.download = fileName;
    dlLink.href = imgURL;
    dlLink.dataset.downloadurl = [MIME_TYPE, dlLink.download, dlLink.href].join(':');
    console.log(dlLink)
    document.body.appendChild(dlLink);
    dlLink.click();
    document.body.removeChild(dlLink);
}

getContour("https://static05.jockey.in/uploads/dealimages/8670/detailimages/orange-and-navy-boys-striped-t-shirt-ab09-4.jpg")