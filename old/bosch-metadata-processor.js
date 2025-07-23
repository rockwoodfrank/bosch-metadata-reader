const ICON_SRC = {
    motion: "img/videooverlay/motion.png",
    trackeractive: "img/videooverlay/tracker-active.png",
    trackerpassive: "img/videooverlay/tracker-passive.png",
    trackeridle: "img/videooverlay/tracker-idle.png",
    trackerpause: "img/videooverlay/tracker-pause.png",
    gunshot: "img/videooverlay/gunshot.png",
    scream: "img/videooverlay/scream.png",
    t3_smoke: "img/videooverlay/smoke.png",
    t4_carbonmonoxide: "img/videooverlay/carbonmonoxide.png",
    glassbreak: "img/videooverlay/glassbreak.png",
    unclassifiednoise: "img/videooverlay/unclassifiednoise.png"
};

const TRACKER_STATES = [
    {state: 0, cls: 'tracker-off', src: ''},
    {state: 1, cls: 'tracker-idle', src: ICON_SRC.trackeridle},
    {state: 2, cls: 'tracker-passive', src: ICON_SRC.trackerpassive},
    {state: 3, cls: 'tracker-active', src: ICON_SRC.trackeractive}
];

const AUDIO_ALARM_TYPES = [
    {type: 0, src: ICON_SRC.gunshot},
    {type: 1, src: ICON_SRC.t3_smoke},
    {type: 2, src: ICON_SRC.t4_carbonmonoxide}
]

const OBJECT_CLASS_MARKER = [
    {type: 1, icon: 'img/videooverlay/class-person.svg', text: 'Person'}, //person
    {type: 2, icon: '', text: ''}, //head
    {type: 3, icon: 'img/videooverlay/class-car.svg', text: 'Car'}, //car
    {type: 4, icon: '', text: ''}, //group of persons
    {type: 5, icon: 'img/videooverlay/class-bike.svg', text: 'Bike'}, //bike
    {type: 6, icon: 'img/videooverlay/class-truck.svg', text: 'Truck'}, //truck
    {type: 7, icon: '', text: ''}, //small object
    {type: 8, icon: '', text: ''}, //face
    {type: 9, icon: '', text: ''}, //camera trainer object
    {type: 10, icon: '', text: ''}, //vehicle
    {type: 11, icon: '', text: ''}, //outlier object
]

const BoschMetadataProcessor = function (_cfg) {
    const cfg = _cfg || {};
    const cnv = cfg.cnv;
    const dbg = cfg.debug || false;
    const displaycfg = _cfg.displaycfg || {};
    displaycfg.shapes = displaycfg.shapes || false;
    displaycfg.trajectories = displaycfg.trajectories || false;
    displaycfg.boxes = displaycfg.boxes || false;
    displaycfg.faces = displaycfg.faces || false;
    displaycfg.icons = displaycfg.icons || false;

    let fac = { x: 1, y: 1 };

    let ctx = null;
    let svgoverlay = null;
    let htmloverlay = new HTMLOverlay(_cfg);
    if (cnv) {
        ctx = cnv.getContext('2d');
        fac.x = cnv.width / 2.0;
        fac.y = cnv.height / 2.0;
    } else if (cfg.svgoverlay) {
        svgoverlay = new SVGOverlay(_cfg);
    }
    let delta = {
        x: 0,
        y: 0
    };
    let roi = {
        tl: {x: 0, y: 0},
        br: {x: 0x8000, y: 0x8000}
    };
    let trackedObjs = new Map();
    let trackedFaces = new Map();
    let fireitems = { smoke: null, flame: null };
    let motionMap = null;
    let alarmFlags = null;
    let domeState = null;
    let frameinfo = {width: 0, height: 0};
    let ruleengine = null;
    let audioalarm = {
        timestamp: 0,
        type: -1
    };
    let log = LogFactory.getLogger('metadataprocessor');

    let alarmicons = new Image();
    alarmicons.src = ICON_SRC.motion;

    let colors = {
        alarm: '#EA0016',
        object: '#FCAF17',
        face: '#FCAF17',
        trajectories: '#78BE20',
        motionmap: '#FCAF1750',
    };

    function reset() {
        trackedObjs = new Map();
        trackedFaces = new Map();
        motionMap = null;
        alarmFlags = null;
    }

    function processMsg(msg) {
        let objs = BoschMetaDataParser.parse(msg);
        if (objs) {
            for (var i = 0; i < objs.length; i++) {
                let o = objs[i];
                switch (o.tag) {
                    case 0x01:
                        // frame info
                        if (frameinfo.width !== o.width || frameinfo.height !== o.height) {
                            frameinfo.width = o.width;
                            frameinfo.height = o.height;
                            if (cnv) {
                                fac.x = cnv.width / o.width;
                                fac.y = cnv.height / o.height;
                            }
                            if (svgoverlay) {
                                svgoverlay.setFrameInfo(frameinfo);
                            }
                            if (ctx) {
                                ctx.clearRect(0, 0, cnv.width, cnv.height);
                            }
                            resized();
                        }
                        break;
                    case 0x02:
                        // alarm flags
                        alarmFlags = o;
                        break;
                    case 0x03:
                        // motion map
                        motionMap = new CustomObject(o);
                        break;
                    case 0x04:
                        // object properties
                        let to_prev = trackedObjs.get(o.id);
                        if ((to_prev && to_prev.obj.alarm && !o.alarm) || (to_prev && to_prev.obj.postalarm)) {
                            o.postalarm = true;
                        }
                        let to = to_prev || new TrackedObject();
                        to.obj = o;
                        for (let j = 0; j < o.objects.length; j++) {
                            let obj = o.objects[j];
                            if (obj.typ === 0x06) {
                                to.objectclass = obj;
                            } else if (obj.typ === 0x12) {
                                to.addPoint(obj.base.x, obj.base.y);
                                to.shape = obj
                            }
                        }
                        trackedObjs.set(o.id, to);
                        break;
                    case 0x26:
                        // counter
                        // console.log("counter: ", o);
                        if (ruleengine != null) {
                            for (let i = 0; i < o.counter.length; i++) {
                                let c = ParseUtils.getObjById(ruleengine.script_parsed.counters, o.counter[i].id);
                                log('counter to draw: ', c, o.counter[i]);
                            }
                        }
                        break;
                    case 0x03a:
                        domeState = o;
                        break;
                    case 0x3d:
                        // text display
                        log('text: ', o);
                        break;
                    case 0x3e:
                        // face properties
                        let face = trackedFaces.get(o.id) || new FaceObject();
                        face.obj = o;
                        face.update();
                        trackedFaces.set(o.id, face);
                        break;
                    case 0x49:
                        fireitems.flame = new CustomObject(o);
                        break;
                    case 0x4a:
                        fireitems.smoke = new CustomObject(o);
                        break;
                    case 0x51:
                        console.log("audioalarm, type: ", o.audiotype, ", active: ", o.alarm, ", confidence: ", o.confidence);
                        if (o.alarm) {
                            audioalarm.type = o.audiotype;
                            audioalarm.timestamp = new Date().getTime();
                        } else if (audioalarm.type === o.audiotype) {
                            // clear alarm
                            audioalarm.type = -1;
                            audioalarm.timestamp = 0;
                        }
                        break;
                    case 0xfe:
                        // vca config
                        log("vca config: ", o);
                        // ruleengine =  ParseUtils.getObjById(o.data.tags, 0x11);
                        break;
                    default:
                        // unknown
                        // console.log("unknown tag: ", o);
                }
            }
        }
        drawShapes()
    }

    function resized() {
        if (svgoverlay == null) {
            let roi_px = {
                x: roi.tl.x / 0x8000 * frameinfo.width,
                y: roi.tl.y / 0x8000 * frameinfo.height,
                width: (roi.br.x - roi.tl.x) / 0x8000 * frameinfo.width,
                height: (roi.br.y - roi.tl.y) / 0x8000 * frameinfo.height
            };
            fac = {
                x: cnv.width / roi_px.width,
                y: cnv.height / roi_px.height
            };
            // dx/dy based on roi-independent factor
            delta = {
                x: roi_px.x * fac.x * -1,
                y: roi_px.y * fac.y * -1
            }
        }
        // console.log('canvas: ' + cnv.width + 'x' + cnv.height + ', frameinfo: ' + frameinfo.width + 'x' + frameinfo.height + ', fac: ' + fac.x + 'x' + fac.y + ', delta: ' + delta.x + 'x' + delta.y)
        // console.log('roi: ' + roi.tl.x + 'x' + roi.tl.y + ' - ' + roi.br.x + 'x' + roi.br.y + ', fac: ' + fac.x + 'x' + fac.y)
    }

    function toCnvX(x) {
        return x * fac.x + delta.x
    }

    function toCnvY(y) {
        return y * fac.y + delta.y
    }

    function drawShapes() {
        requestAnimationFrame(doDrawShapes)
    }

    function doDrawShapes() {
        if (svgoverlay) {
            svgoverlay.drawTrackedObjects(trackedObjs);
            svgoverlay.drawTrackedFaces(trackedFaces);
            svgoverlay.drawMotionMap(motionMap);
            svgoverlay.drawFireDetection(fireitems);
            if (htmloverlay) {
                htmloverlay.drawIcons(alarmFlags, domeState, audioalarm);
            }
            return;
        }
        ctx.clearRect(0, 0, cnv.width, cnv.height);
        if (dbg) {
            drawText('BOSCH meta', 5, 25, 24, '#ff0000')
        }
        trackedObjs.forEach(function (obj, id) {
            // delete object when no update arrived
            if (obj.lastUpdate() > 1000) {
                log('remove obj ', obj);
                trackedObjs.delete(id);
            } else {
                // Bounding Box
                if (displaycfg.boxes === true || (displaycfg.boxes === 'auto' && obj.shape.polygon.length === 0)) {
                    ctx.strokeStyle = obj.obj.alarm ? colors.alarm : colors.object;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(toCnvX(obj.shape.bb.x), toCnvY(obj.shape.bb.y), obj.shape.bb.width * fac.x, obj.shape.bb.height * fac.y);
                    if (dbg) {
                        drawText('Object' + obj.obj.id, toCnvX(obj.shape.bb.x), toCnvY(obj.shape.bb.y), 14, colors.alarm);
                        log('object: ', obj)
                    }
                }
                // Polygon Shape
                if (displaycfg.shapes) {
                    // log('poly to draw: %s', obj.shape.polygon);
                    if (obj.shape.polygon.length > 0) {
                        ctx.strokeStyle = obj.obj.alarm ? colors.alarm : colors.object;
                        ctx.lineWidth = 2;
                        let cur = {
                            x: toCnvX(obj.shape.bb.x + obj.shape.start.x),
                            y: toCnvY(obj.shape.bb.y + obj.shape.start.y)
                        };
                        ctx.beginPath();
                        ctx.moveTo(cur.x, cur.y);
                        for (let i = 0; i < obj.shape.polygon.length; i++) {
                            cur.x += obj.shape.polygon[i].dx * fac.x;
                            cur.y += obj.shape.polygon[i].dy * fac.y;
                            ctx.lineTo(cur.x, cur.y);
                        }
                        ctx.closePath();
                        ctx.stroke();
                    }
                }
                // Trajectory
                if (displaycfg.trajectories) {
                    ctx.strokeStyle = colors.trajectories;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(toCnvX(obj.trajectory[0].x), toCnvY(obj.trajectory[0].y));
                    for (let i = 0; i < obj.trajectory.length; i++) {
                        ctx.lineTo(toCnvX(obj.trajectory[i].x), toCnvY(obj.trajectory[i].y), 1)
                    }
                    ctx.stroke()
                }
            }
        });
        // draw faces
        if (displaycfg.faces) {
            trackedFaces.forEach(function (face, id) {
                // delete object when no update arrived
                if (face.lastUpdate() > 1000) {
                    log('remove face ', face);
                    trackedFaces.delete(id)
                } else {
                    ctx.strokeStyle = colors.face;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(toCnvX(face.obj.bb.x), toCnvY(face.obj.bb.y), face.obj.bb.width * fac.x, face.obj.bb.height * fac.y);
                    if (dbg) {
                        var txt = 'Face ' + face.obj.id + ', Obj ' + face.obj.assigned_obj_id + ', confidence: ' + face.obj.image_confidence;
                        drawText(txt, toCnvX(face.obj.bb.x), toCnvX(face.obj.bb.y), 14, colors.face)
                    }
                }
            })
        }
        // draw motion map
        if (motionMap && displaycfg.shapes) {
            // console.log(motionMap)
            ctx.fillStyle = colors.motionmap;
            for (let row = 0; row < motionMap.map.length; row++) {
                for (let col = 0; col < motionMap.map[row].length; col++) {
                    if (motionMap.map[row][col]) {
                        if (motionMap.bits_for_cell_changed === 0) {
                            ctx.fillRect(
                                toCnvX(motionMap.cells_start_x + (col * motionMap.cells_step_x)),
                                toCnvY(motionMap.cells_start_y + (row * motionMap.cells_step_y)),
                                motionMap.cells_step_x * fac.x,
                                motionMap.cells_step_y * fac.y)
                        }
                        /*
                        if (motionMap.bits_for_cell_changed === 1) {
                            ctx.fillStyle = '#ffff00' + (('00' + motionMap.map[row][col].toString(16)).slice(-2))
                            ctx.fillRect(
                                toCnvX(motionMap.cells_start_x + (col * motionMap.cells_step_x)),
                                toCnvY(motionMap.cells_start_y + (row * motionMap.cells_step_y)),
                                motionMap.cells_step_x * fac.x,
                                motionMap.cells_step_y * fac.y)
                        }
                         */
                    }
                }
            }
        }
        // draw alarm flags
        if (alarmFlags && displaycfg.icons) {
            let icon_size = Math.round(cnv.width * 0.06);
            let icon_x = cnv.width - icon_size - 20;
            let icon_y = Math.round(cnv.height * 0.27);
            if (alarmFlags.data[0] & 0x80) {
                ctx.globalAlpha = 0.6;
                ctx.drawImage(alarmicons, icon_x, icon_y, icon_size, icon_size);
                ctx.globalAlpha = 1;
            }
        }
        if (domeState && domeState.trackerstatus) {
            console.log("tracker state: ", domeState.trackerstatus);
        }
    }

    function drawText(txt, x, y, size, color) {
        ctx.fillStyle = color;
        ctx.font = 'normal ' + size + 'px sans-serif';
        ctx.fillText(txt, x, y)
    }

    function setRoi(tlx, tly, brx, bry) {
        if (roi.tl.x != tlx || roi.tl.y != tly || roi.br.x != brx || roi.br.y != bry) {
            roi.tl.x = tlx;
            roi.tl.y = tly;
            roi.br.x = brx;
            roi.br.y = bry;
            resized()
        }
        if (svgoverlay) {
            svgoverlay.setRoi(tlx, tly, brx, bry);
        }
    }

    return {
        processMsg: processMsg,
        setRoi: setRoi,
        resized: resized,
        reset: reset
    }
};

function TrackedObject() {
    this.MAX = 50;
    this.timestamp = new Date().getTime();

    this.obj = null;
    this.trajectory = [];
    this.shape = null;
    this.objectclass = null;

    this.addPoint = function (x, y) {
        this.trajectory.push({x: x, y: y});
        if (this.trajectory.length > this.MAX) {
            this.trajectory = this.trajectory.slice(-this.MAX)
        }
        this.timestamp = new Date().getTime()
    };

    this.lastUpdate = function () {
        return (new Date().getTime()) - this.timestamp
    }
}

function FaceObject() {
    this.obj = null;
    this.timestamp = new Date().getTime();

    this.update = function () {
        this.timestamp = new Date().getTime()
    };

    this.lastUpdate = function () {
        return (new Date().getTime()) - this.timestamp
    }
}

function CustomObject(o) {
    this.obj = o;
    this.timestamp = new Date().getTime();

    this.update = function () {
        this.timestamp = new Date().getTime()
    };

    this.lastUpdate = function () {
        return (new Date().getTime()) - this.timestamp
    }
}

const BoschMetaDataParser = (function () {
    let busy = false;
    let pending_msg = null;
    let pending_obj_tag = null;
    let vcaparser = null;

    function parse(msg) {
        if (busy) {
            console.log('BoschMetadataProcessor not yet finished');
            return
        }
        // console.log("parse meta data: ", JSON.stringify(msg));
        busy = true;
        let objs = [];
        let is = new DataStream(msg.data, 0, DataStream.BIG_ENDIAN);
        while (!is.isEof()) {
            var o = {};
            var tmp = is.readUint16(null);
            o.continuation = (tmp & 0x8000) !== 0;
            o.continued = (tmp & 0x4000) !== 0;
            o.tag = (tmp & 0x3FF);
            tmp = is.readUint16(null);
            o.layer = (tmp & 0xF000) >> 12;
            o.length = tmp & 0x0FFF;
            o.data = is.readUint8Array(o.length);

            if (o.continuation) {
                if (pending_msg !== null) {
                    if (pending_msg.tag === o.tag) {
                        let merged = new Uint8Array(pending_msg.data.length + o.data.length);
                        merged.set(pending_msg.data);
                        merged.set(o.data, pending_msg.data.length);
                        o.data = merged;
                        o.length = o.data.length;
                        o.continuation = false;
                        if (!o.continued) {
                            pending_msg = null
                        }
                        // console.log('pending msg extended')
                    } else {
                        console.warn('pending msg is a different tag: ' + pending_msg.tag + ', current: ' + o.tag)
                    }
                } else {
                    console.warn('continuation bit is set but pending msg is null');
                    continue
                }
            }
            if (o.continued) {
                pending_msg = o;
                // console.log('pending msg set')
                continue
            }

            parseTag(o);
            objs.push(o)
        }
        busy = false;
        return objs
    }

    function parseTag(o) {
        let is = new DataStream(o.data, 0, DataStream.BIG_ENDIAN);
        switch (o.tag) {
            case 0x01:
                o.type = 'frameinfo';
                o.skip = is.readUint16(null);
                o.width = is.readUint16(null);
                o.height = is.readUint16(null);
                break;
            case 0x02:
                o.type = 'alarmflags';
                o.data = is.readUint8Array(o.length);
                break;
            case 0x03:
                o.type = 'motionmap';
                o.data = is.readUint8Array(o.length);
                o = parseMotionMap(o);
                break;
            case 0x04:
                o.type = 'objectproperties';
                o.data = is.readUint8Array(o.length);
                o = parseObjectProps(o);
                break;
            case 0x05:
                o.type = 'eventstate';
                o.data = is.readUint8Array(o.length);
                break;
            case 0x26:
                o.type = 'counters';
                o.count = is.readUint8();
                o.counter = [];
                for (var c = 0; c < o.count; c++) {
                    var counter = {};
                    counter.id = is.readUint8();
                    counter.value = is.readUint32();
                    o.counter.push(counter);
                }
                break;
            case 0x32:
                o.type = 'vcdalarm';
                o.data = is.readUint8Array(o.length);
                o = parseVCDAlarm(o);
                break;
            case 0x3a:
                o.type = 'domestate';
                o.data = is.readUint8Array(o.length);
                o = parseDomeState(o);
                break;
            case 0x3d:
                o.type = 'textdisplay';
                o.data = is.readUint8Array(o.length);
                break;
            case 0x3e:
                o.type = 'faceproperties';
                o.data = is.readUint8Array(o.length);
                o = parseFaceProps(o);
                break;
            case 0x49:
                o.type = 'flamedetection';
                o.data = is.readUint8Array(o.length);
                o = parseFlameDetectionInfo2(o);
                break;
            case 0x4a:
                o.type = 'smokedetection';
                o.data = is.readUint8Array(o.length);
                o = parseSmokeDetectionInfo2(o);
                break;
            case 0x51:
                o.type = 'audioanalysis';
                o.data = is.readUint8Array(o.length);
                o = parseAudioAnalysis(o);
                break;
            case 0xFE:
            case 0xFF:
                if (!vcaparser) {
                    vcaparser = new VCAParser();
                }
                o.type = 'vcaconfig';
                o.data = vcaparser.parse(o.data);
                break;
            default:
                // console.log('unknown tag: 0x' + o.tag.toString(16))
                o.type = 'unknown';
                o.data = is.readUint8Array(o.length)
        }
        // don't move the whole data array around
        // delete o.data
        return o
    }

    function parseVCDAlarm(o) {
        try {
            let is = new DataStream(o.data, 0, DataStream.BIG_ENDIAN);
            o.timestamp = is.readUint32();
            o.id = is.readUint16() & 0x1FFF;
            o.flags = is.readUint8();
            o.flag_state = (o.flags & 0x80) !== 0;
            o.flag_delete = (o.flags & 0x40) !== 0;
            o.flag_stateset = (o.flags & 0x20) !== 0;
            o.flag_additionalinfo = (o.flags & 0x10) !== 0;
            o.changecount = is.readUint8();
            // length - values before and 00 00 at the end
            o.name = is.readUCS2String((o.length - 10) / 2, DataStream.BIG_ENDIAN);
        } catch (e) {
            console.log("error parsing vcd alarm: ", e);
        }
        return o;
    }

    function parseAudioAnalysis(o) {
        try {
            let is = new DataStream(o.data, 0, DataStream.BIG_ENDIAN);
            o.timestamphigh = is.readUint32();
            o.timestamplow = is.readUint32();
            o.audiotype = is.readUint8();
            o.confidence = is.readUint8();
            o.direction = is.readUint16();
            let tmp = is.readUint8();
            o.alarm = (tmp & 0x80) >> 7;
        } catch (e) {
            console.log("error parsing audio analysis: ", e);
        }
        return o;
    }

    function parseDomeState(o) {
        let is = new DataStream(o.data, 0, DataStream.BIG_ENDIAN);
        let b = is.readUint8();
        o.ptzvalid = (b&0x80) != 0;
        o.trackeractive = (b&0x40) != 0;
        o.usermode = (b&0x20) != 0;
        if (o.ptzvalid) {
            o.pan = is.readUint16();
            o.tilt = is.readUint16();
            o.zoom = is.readUint16();
        }
        if (o.trackeractive) {
            o.trackertaskid = is.readUint16();
        }
        o.trackerstatus = is.readUint8();
        return o;
    }

    function parseMotionMap(o) {
        o.name = 'motionmap';
        var is = new BitInputStreamUInt8(o.data);
        o.bits_for_cell_changed = is.readBits(1);
        o.nbr_of_nibbles_minus1 = is.readBits(3);
        var v = (4 * (o.nbr_of_nibbles_minus1 + 1));
        o.cells_x = is.readUnsignedBits(v);
        o.cells_y = is.readUnsignedBits(v);
        o.cells_step_x = is.readUnsignedBits(v);
        o.cells_step_y = is.readUnsignedBits(v);
        o.cells_start_x = is.readUnsignedBits(v);
        o.cells_start_y = is.readUnsignedBits(v);
        o.cell_bits = 1;
        if (o.bits_for_cell_changed === 1) {
            var bitsRead = (6 * v * 4 + 4);
            is.readBits(8 - (bitsRead % 8));
            o.cell_bits = 8
        }
        o.map = [];
        for (let row = 0; row < o.cells_y; row++) {
            o.map.push([]);
            for (let col = 0; col < o.cells_x; col++) {
                o.map[row].push(is.readUnsignedBits(o.cell_bits))
            }
        }
    }

    function parseObjectProps(o) {
        let readCnt = 0;
        let is = new DataStream(o.data, 0, DataStream.BIG_ENDIAN);
        o.id = is.readUint32();
        var tmp = is.readUint8();
        o.unchanged = (tmp & 0x80) !== 0;
        o.alarm = (tmp & 0x40) !== 0;
        o.idle = (tmp & 0x20) !== 0;
        o.removed = (tmp & 0x10) !== 0;
        o.splitOff = (tmp & 0x8) !== 0;
        o.uncovered_background_by_started_track = (tmp & 0x4) !== 0;
        o.selected_for_dome_tracking = (tmp & 0x2) !== 0;
        o.frozen_idle_dome_tracking = (tmp & 0x1) !== 0;
        readCnt += 5;
        if (o.idle) {
            o.idletime = is.readUint32(null);
            readCnt += 4
        }
        o.objects = [];
        while (!is.isEof()) {
            let obj = {};
            obj.typ = is.readUint8();
            let tmp = is.readUint8();
            obj.continuation = (tmp & 0x80) !== 0;
            obj.continued = (tmp & 0x40) !== 0;
            obj.length = tmp & 0x3F;
            obj.data = is.readUint8Array(obj.length);
            readCnt += obj.length;
            if (obj.continuation) {
                if (pending_obj_tag !== null) {
                    if (pending_obj_tag.typ === obj.typ) {
                        // merge
                        let merged = new Uint8Array(pending_obj_tag.data.length + obj.data.length);
                        merged.set(pending_obj_tag.data);
                        merged.set(obj.data, pending_obj_tag.data.length);
                        obj.data = merged;
                        obj.length = obj.data.length;
                        obj.continuation = false;
                        if (!obj.continued) {
                            pending_obj_tag = null
                        }
                    } else {
                        console.warn('pending object tag is a different type: ' + pending_obj_tag.type + ', current: ' + obj.typ)
                    }
                } else {
                    console.warn('continuation bit is set but pending object tag is null');
                    continue
                }
            }
            if (obj.continued) {
                pending_obj_tag = obj;
                // console.log('pending tag set')
                continue
            }
            switch (obj.typ) {
                case 0x06:
                    // object_class
                    obj.name = 'object_class';
                    obj.certainty = obj.data[0];
                    obj.classid = obj.data[1];
                    if (obj.data.length > 2) {
                        obj.subclassid = obj.data[2];
                    }
                    break;
                case 0x12:
                    // object_current_shape_polygon_tag
                    obj = parseCurrentShapePoly(obj);
                    break;
                default:
                    obj.name = 'unknown tag'
                // console.log('unknown object typ: ', obj)
            }
            o.objects.push(obj)
        }
        return o
    }

    function parseCurrentShapePoly(o) {
        o.name = 'current_shape_poly';
        var is = new BitInputStreamUInt8(o.data);
        var nibbles_minus1_pos = is.readBits(2);
        var nibbles_minus1_dim = is.readBits(2);
        var v = (4 * (nibbles_minus1_pos + 1));
        var w = (4 * (nibbles_minus1_dim + 1));
        var z = (4 * 2 * (nibbles_minus1_dim + 1));
        o.bb = {};
        o.bb.x = is.readSignedBits(v);
        o.bb.y = is.readSignedBits(v);
        o.bb.width = is.readUnsignedBits(w);
        o.bb.height = is.readUnsignedBits(w);
        o.center = {};
        o.center.x = is.readUnsignedBits(w);
        o.center.y = is.readUnsignedBits(w);
        o.base = {};
        o.base.x = is.readSignedBits(v);
        o.base.y = is.readSignedBits(v);
        o.start = {};
        o.start.x = is.readUnsignedBits(w);
        o.start.y = is.readUnsignedBits(w);
        o.objsize = is.readUnsignedBits(z);
        var vertices_minus1 = is.readUnsignedBits(16);
        var bits_minus1_delta_pos = is.readUnsignedBits(4);
        var n = bits_minus1_delta_pos + 1;
        o.polygon = [];
        o.top = {
            x: o.bb.x + o.start.x,
            y: o.bb.y + o.start.y,
        };
        var cur = { x: o.top.x, y: o.top.y}
        for (var i = 0; i < vertices_minus1; i++) {
            var p = {};
            p.dx = is.readSignedBits(n);
            p.dy = is.readSignedBits(n);
            o.polygon.push(p)
            cur.x += p.dx;
            cur.y += p.dy;
            if (cur.y < o.top.y) {
                o.top.x = cur.x;
                o.top.y = cur.y;
            }
        }
        // console.log("poly: ", JSON.stringify(o));
        return o
    }

    function parseFaceProps(o) {
        let is = new DataStream(o.data, 0, DataStream.BIG_ENDIAN);
        o.id = is.readUint32();
        let tmp = is.readUint8();
        o.alarm = (tmp & 0x80) !== 0;
        o.has_assigned_obj = (tmp & 0x40) !== 0;
        o.bb = {};
        o.bb.x = is.readInt16();
        o.bb.y = is.readInt16();
        o.bb.width = is.readInt16() - o.bb.x;
        o.bb.height = is.readInt16() - o.bb.y;
        o.tracked_confidence = is.readUint16();
        o.image_confidence = is.readUint16();
        o.score = is.readUint16();
        o.objs = [];
        if (o.has_assigned_obj) {
            o.assigned_obj_id = is.readUint32()
        }
        while (!is.isEof()) {
            let tmpObj = {};
            tmpObj.tag = is.readUint8();
            let tmp = is.readUint8();
            tmpObj.continuation = (tmp & 0x80) !== 0;
            tmpObj.continued = (tmp & 0x40) !== 0;
            tmpObj.length = tmp & 0x3F;
            tmpObj.data = is.readUint8Array(tmpObj.length);
            o.objs.push(tmpObj)
        }
        return o
    }

    function parseSmokeDetectionInfo2(o) {
        let is = new DataStream(o.data, 0, DataStream.BIG_ENDIAN);
        let nbr_alarm_areas = is.readUint8();
        o.alarm_areas = [];
        for (var i = 0; i < nbr_alarm_areas; i++) {
            var area = {};
            area.x = is.readUint16();
            area.y = is.readUint16();
            area.width = is.readUint16();
            area.height = is.readUint16();
            o.alarm_areas.push(area);
        }
        o.alarm_candidate_areas = [];
        let nbr_alarm_candidate_areas = is.readUint8();
        for (var i = 0; i < nbr_alarm_candidate_areas; i++) {
            var area = {};
            area.x = is.readUint16();
            area.y = is.readUint16();
            area.width = is.readUint16();
            area.height = is.readUint16();
            area.nbr_pixels = is.readUint32();
            area.verification_time = is.readUint16();
            o.alarm_candidate_areas.push(area);
        }
        o.detectors = [];
        let number_of_detectors = (is.readUint8() >> 4);
        for (var i = 0; i < number_of_detectors; i++) {
            var detector = {};
            detector.nbr_pixels = is.readUint32();
            detector.accumulation_level = is.readUint8();
            o.detectors.push(detector);
        }
        return o;
    }

    function parseFlameDetectionInfo2(o) {
        let is = new DataStream(o.data, 0, DataStream.BIG_ENDIAN);
        let nbr_alarm_areas = is.readUint8();
        o.alarm_areas = [];
        for (var i = 0; i < nbr_alarm_areas; i++) {
            var area = {};
            area.x = is.readUint16();
            area.y = is.readUint16();
            area.width = is.readUint16();
            area.height = is.readUint16();
            o.alarm_areas.push(area);
        }
        let nbr_alarm_candidate_areas = is.readUint8();
        let nbr_alarm_levels = is.readUint8();
        o.alarm_candidate_areas = [];
        for (var i = 0; i < nbr_alarm_candidate_areas; i++) {
            var area = {};
            area.x = is.readUint16();
            area.y = is.readUint16();
            area.width = is.readUint16();
            area.height = is.readUint16();
            area.alarmlevels = [];
            for (var j = 0; j < nbr_alarm_levels; j++) {
                area.alarmlevels.push(is.readUint32());
            }
            o.alarm_candidate_areas.push(area);
        }
        return o;
    }

    return {
        parse: parse
    }
})();

const PicInfoProcessor = function (_cfg) {
    const cfg = _cfg || {};
    // paint on canvas
    const cnv = cfg.cnv || null;
    const ctx = cnv === null ? null : cnv.getContext('2d');
    // display in html element
    const htmlelem = cfg.htmlelem || null;

    let fac = {
        x: 1,
        y: 1
    };

    if (cnv) {
        fac = {
            x: cnv.width / 255,
            y: cnv.height / 255
        }
    }

    function processMsg(msg) {
        // console.log('parsing ', msg.data)
        if (ctx) {
            ctx.clearRect(0, 0, cnv.width, cnv.height)
        }
        let objs = PicInfoParser.parse(msg);
        for (var i = 0; i < objs.length; i++) {
            switch (objs[i].tag) {
                case 0x0004:
                case 0x0005:
                case 0x0006:
                case 0x0007:
                case 0x0008:
                    // draw text
                    if (ctx) {
                        ctx.fillStyle = '#ffffff';
                        ctx.font = 'normal 24px sans-serif';
                        ctx.fillText(objs[i].text, objs[i].x * fac.x, objs[i].y * fac.y)
                    }
                    if (htmlelem) {
                        htmlelem.innerHTML = objs[i].text;
                        htmlelem.style.left = (objs[i].x / 2.55) + '%';
                        htmlelem.style.top = (objs[i].y / 2.55) + '%'
                    }
                    break;
                default:
                // nothing
            }
        }
    }

    return {
        processMsg: processMsg
    }
};

const PicInfoParser = (function () {
    function parse(msg) {
        let objs = [];
        let is = new DataStream(msg.data, 0, DataStream.BIG_ENDIAN);
        while (!is.isEof()) {
            let o = {};
            o.tag = is.readUint16();
            o.length = is.readUint16();
            switch (o.tag) {
                case 0x0004:
                case 0x0005:
                case 0x0006:
                case 0x0007:
                case 0x0008:
                    o.type = 'string';
                    o.x = is.readUint8();
                    o.y = is.readUint8();
                    o.text = is.readString(o.length - 4 - 2, 'ascii')
                        .replace(/^\W+/, '').replace(/\W+$/, '');
                    break;
                default:
                    o.type = 'unknown';
                    o.data = is.readUint8Array(o.length - 4)
            }
            objs.push(o)
        }
        return objs
    }

    return {
        parse: parse
    }
})();
const SVGOverlay = (function (_cfg) {
    let log = LogFactory.getLogger('svgoverlay');
    const cfg = _cfg || {};
    const dbg = cfg.debug || false;
    const showClassNames = sessionStorage.getItem('classnames') !== null;
    const fac_meta2svg = { x: 1, y: 1 };
    const displaycfg = _cfg.displaycfg || {};
    displaycfg.shapes = displaycfg.shapes || false;
    displaycfg.trajectories = displaycfg.trajectories || false;
    displaycfg.boxes = displaycfg.boxes || false;
    displaycfg.faces = displaycfg.faces || false;
    displaycfg.icons = displaycfg.icons || false;
    log ("create SVGOverlay, cfg: %o", _cfg);

    const svg = cfg.svgoverlay;
    svg.innerHTML = '';

    let svgsize = {
        width: 100,
        height: 100
    };

    let roi = {
        tl: {x: 0, y: 0},
        br: {x: 0x8000, y: 0x8000}
    };

    function setRoi(tlx, tly, brx, bry) {
        if (roi.tl.x != tlx || roi.tl.y != tly || roi.br.x != brx || roi.br.y != bry) {
            roi.tl.x = tlx;
            roi.tl.y = tly;
            roi.br.x = brx;
            roi.br.y = bry;
            updateViewBox();
        }
    }

    function updateViewBox() {
        var viewbox = {
            x: roi.tl.x === 0 ? 0 : Math.round((roi.tl.x / 0x8000) * svgsize.width),
            y: roi.tl.y === 0 ? 0 : Math.round((roi.tl.y / 0x8000) * svgsize.height)
        };
        viewbox.width = Math.round(roi.br.x / 0x8000 * svgsize.width) - viewbox.x;
        viewbox.height = Math.round(roi.br.y / 0x8000 * svgsize.height) - viewbox.y;
        log('roi: %j, new viewbox: %j', roi, viewbox);
        svg.setAttribute('viewBox', viewbox.x + ' ' +  viewbox.y + ' ' + viewbox.width + ' ' + viewbox.height);
    }

    function setFrameInfo(info) {
        log("set frame info: %j", info);
        svgsize.width = info.width;
        svgsize.height = info.height;
        updateViewBox();
    }

    function drawTrackedObjects(trackedObjs) {
        trackedObjs.forEach(function (obj, id) {
            let svgobj = svg.querySelector('#object-'+id);
            if (obj.lastUpdate() > 1000) {
                if (svgobj) {
                    log('remove shape of obj ', obj);
                    svgobj.remove();
                }
                trackedObjs.delete(id);
            } else {
                if (!svgobj) {
                    // add shape
                    svgobj = document.createElementNS("http://www.w3.org/2000/svg", 'g');
                    svgobj.classList.add('object', 'object-' + id);
                    svgobj.setAttribute('id', 'object-' + id);
                    if (displaycfg.shapes) {
                        let poly = document.createElementNS("http://www.w3.org/2000/svg", 'path');
                        poly.classList.add('shape');
                        svgobj.appendChild(poly);
                        if (showClassNames) {
                        let classtext_rect = document.createElementNS("http://www.w3.org/2000/svg", 'rect');
                        classtext_rect.classList.add('class-text-rect');
                        svgobj.appendChild(classtext_rect);
                        let classtext = document.createElementNS("http://www.w3.org/2000/svg", 'text');
                        classtext.classList.add('class-text');
                        svgobj.appendChild(classtext);
                        } else {
                          let classicon = document.createElementNS("http://www.w3.org/2000/svg", 'image');
                          classicon.classList.add('class-icon');
                          classicon.setAttribute('width', 16);
                          classicon.setAttribute('height', 16);
                          svgobj.appendChild(classicon);
                        }
                    }
                    if (displaycfg.trajectories) {
                        let trajectory = document.createElementNS("http://www.w3.org/2000/svg", 'path');
                        trajectory.classList.add('trajectory');
                        svgobj.appendChild(trajectory);
                    }
                    if(dbg) {
                        let text = document.createElementNS("http://www.w3.org/2000/svg", 'text');
                        text.classList.add('description');
                        svgobj.appendChild(text);
                    }
                    svg.appendChild(svgobj);
                }

                // update svg
                let shape = svgobj.querySelector('.shape');
                if (shape) {
                    shape.setAttribute('d', createPolyPathString(obj));
                }
                let trajectory = svgobj.querySelector('.trajectory');
                if (trajectory) {
                    trajectory.setAttribute('d', createTrajectoryPathString(obj));
                }
                let boundingbox = svgobj.querySelector('.boundingbox');
                if (boundingbox) {
                    if (displaycfg.boxes === 'auto' && obj.shape.polygon.length > 0) {
                        // remove bounding box
                        boundingbox.remove();
                    } else {
                        boundingbox.setAttribute('x', obj.shape.bb.x);
                        boundingbox.setAttribute('y', obj.shape.bb.y);
                        boundingbox.setAttribute('width', obj.shape.bb.width);
                        boundingbox.setAttribute('height', obj.shape.bb.height);
                    }
                } else if (displaycfg.boxes === 'auto' && obj.shape.polygon.length === 0) {
                    boundingbox = document.createElementNS("http://www.w3.org/2000/svg", 'rect');
                    boundingbox.classList.add('boundingbox');
                    svgobj.appendChild(boundingbox);
                }
                let mark = obj.objectclass != null ? OBJECT_CLASS_MARKER[obj.objectclass.classid - 1] : undefined;
                let classicon = svgobj.querySelector('.class-icon');
                if (classicon) {
                    if (mark && mark.icon) {
                        if (obj.shape.top) {
                            classicon.setAttribute('x', Math.max(0, obj.shape.top.x));
                            classicon.setAttribute('y', Math.max(0, obj.shape.top.y - 16));
                            if (classicon.getAttribute('href') !== mark.icon) {
                                classicon.setAttribute('href', mark.icon);
                            }
                        }
                    } else {
                        classicon.setAttribute('href', '');
                    }
                }
                let classtext_rect = svgobj.querySelector('.class-text-rect');
                let classtext = svgobj.querySelector('.class-text');
                if (classtext && classtext_rect) {
                    if (mark && mark.text) {
                        classtext.innerHTML = mark.text;
                        let textbb = classtext.getBBox();
                        if (false) {
                          // align on bounding box (right)
                          classtext.setAttribute('x', Math.max(0, obj.shape.bb.x + obj.shape.bb.width - textbb.width - 3));
                          classtext.setAttribute('y', Math.max(textbb.height, obj.shape.bb.y - 4));
                        } else {
                          // align on shape
                          classtext.setAttribute('x', Math.max(0, obj.shape.top.x + 4));
                          classtext.setAttribute('y', Math.max(textbb.height, obj.shape.top.y - 4));
                        }
                        textbb = classtext.getBBox();
                        let paddingy = 1;
                        let paddingx = 3;
                        classtext_rect.setAttribute('x', textbb.x - paddingx);
                        classtext_rect.setAttribute('y', Math.max(0, textbb.y - paddingy));
                        classtext_rect.setAttribute('width', textbb.width + paddingx + paddingx);
                        classtext_rect.setAttribute('height', textbb.height + paddingy + paddingy);
                    } else {
                        classtext.innerHTML = "";
                    }
                }
                let dbgtext = svgobj.querySelector('.description');
                if (dbgtext) {
                    dbgtext.setAttribute('x', obj.shape.bb.x + 2);
                    dbgtext.setAttribute('y', obj.shape.bb.y + 10);
                    dbgtext.innerHTML = "Object " + obj.obj.id;
                }
                obj.obj.alarm ? svgobj.classList.add('alarm') : svgobj.classList.remove('alarm');
                obj.obj.postalarm ? svgobj.classList.add('postalarm') : svgobj.classList.remove('postalarm');
                obj.obj.selected_for_dome_tracking ? svgobj.classList.add('dometracking') : svgobj.classList.remove('dometracking')
                if (dbg) {
                    log('object: ', obj);
                }
            }
        })
    }

    function drawTrackedFaces(trackedFaces) {
        if (displaycfg.shapes) {
            trackedFaces.forEach(function (face, id) {
                let svgobj = svg.querySelector('#face-' + id);
                // console.log("face: ", face);
                if (face.lastUpdate() > 1000) {
                    if (svgobj) {
                        log('remove shape of obj ', face);
                        svgobj.remove();
                    }
                    trackedFaces.delete(id);
                } else {
                    if (!svgobj) {
                        svgobj = document.createElementNS("http://www.w3.org/2000/svg", 'g');
                        svgobj.classList.add('face', 'face-' + id);
                        svgobj.setAttribute('id', 'face-' + id);
                        let facerect = document.createElementNS("http://www.w3.org/2000/svg", 'rect');
                        facerect.classList.add('face-rect');
                        svgobj.appendChild(facerect);
                        if (dbg) {
                            let text = document.createElementNS("http://www.w3.org/2000/svg", 'text');
                            text.classList.add('description');
                            svgobj.appendChild(text);
                        }
                        svg.appendChild(svgobj);
                    }

                    // update svg
                    let rect = svgobj.querySelector('.face-rect');
                    if (rect) {
                        rect.setAttribute('x', face.obj.bb.x);
                        rect.setAttribute('y', face.obj.bb.y);
                        rect.setAttribute('width', face.obj.bb.width);
                        rect.setAttribute('height', face.obj.bb.height);
                    }
                    let text = svgobj.querySelector('.description');
                    if (text) {
                        text.setAttribute('x', face.obj.bb.x + 2);
                        text.setAttribute('y', face.obj.bb.y + 10);
                        text.innerHTML = "Face " + face.obj.id;
                    }
                    face.obj.alarm ? svgobj.classList.add('alarm') : svgobj.classList.remove('alarm');
                }
            });
        }
    }

    function drawFireDetection(data) {
        svg.querySelectorAll('.smoke').forEach(function(obj) {
            obj.remove();
        });
        if (data.smoke) {
            if (data.smoke.lastUpdate() < 10000) {
                data.smoke.obj.alarm_areas.forEach(function (area, id) {
                    let svgobj = document.createElementNS("http://www.w3.org/2000/svg", 'g');
                    svgobj.classList.add('smoke', 'smoke-area-' + id);
                    let smokerect = document.createElementNS("http://www.w3.org/2000/svg", 'rect');
                    smokerect.classList.add('smoke-rect');
                    smokerect.setAttribute('x', area.x);
                    smokerect.setAttribute('y', area.y);
                    smokerect.setAttribute('width', area.width);
                    smokerect.setAttribute('height', area.height);
                    svgobj.appendChild(smokerect);
                    svg.appendChild(svgobj);
                });
            }
        }
        svg.querySelectorAll('.flame').forEach(function(obj) {
            obj.remove();
        });
        if (data.flame) {
            if (data.flame.lastUpdate() < 10000) {
                data.flame.obj.alarm_areas.forEach(function (area, id) {
                    let svgobj = document.createElementNS("http://www.w3.org/2000/svg", 'g');
                    svgobj.classList.add('flame', 'flame-area-' + id);
                    let smokerect = document.createElementNS("http://www.w3.org/2000/svg", 'rect');
                    smokerect.classList.add('flame-rect');
                    smokerect.setAttribute('x', area.x);
                    smokerect.setAttribute('y', area.y);
                    smokerect.setAttribute('width', area.width);
                    smokerect.setAttribute('height', area.height);
                    svgobj.appendChild(smokerect);
                    svg.appendChild(svgobj);
                });
            }
        }
    }

    function drawMotionMap(motionMap) {
        if (displaycfg.shapes) {
            // draw motion map
            let svgobj = svg.querySelector('#motionmap');
            if (motionMap && motionMap.lastUpdate() < 2000) {
                let mm = motionMap.obj;
                if (!svgobj) {
                    svgobj = document.createElementNS("http://www.w3.org/2000/svg", 'g');
                    svgobj.classList.add('motionmap');
                    svgobj.setAttribute('id', 'motionmap');
                    for (let row = 0; row < mm.map.length; row++) {
                        for (let col = 0; col < mm.map[row].length; col++) {
                            let field = document.createElementNS("http://www.w3.org/2000/svg", 'rect');
                            field.classList.add('field', 'field-' + col + '-' + row);
                            field.setAttribute('x', mm.cells_start_x + (col * mm.cells_step_x));
                            field.setAttribute('y', mm.cells_start_y + (row * mm.cells_step_y));
                            field.setAttribute('width', mm.cells_step_x);
                            field.setAttribute('height', mm.cells_step_y);
                            svgobj.appendChild(field);
                        }
                    }
                    svg.appendChild(svgobj);
                }
                for (let row = 0; row < mm.map.length; row++) {
                    for (let col = 0; col < mm.map[row].length; col++) {
                        if (mm.bits_for_cell_changed === 0) {
                            let field = svgobj.querySelector('.field-' + col + '-' + row);
                            if (mm.map[row][col]) {
                                field.classList.add('active');
                            } else {
                                field.classList.remove('active')
                            }
                        }
                    }
                }
            } else {
                if (svgobj) {
                    log("remove motionmap")
                    svgobj.remove();
                    motionMap = null;
                }
            }
        }
    }

    function createPolyPathString(obj) {
        let s = "";
        if (obj.shape.polygon.length > 1) {
            s = "M " + (obj.shape.bb.x + obj.shape.start.x) + " " + (obj.shape.bb.y + obj.shape.start.y);
            for (let i = 0; i < obj.shape.polygon.length; i++) {
                s += " l " + obj.shape.polygon[i].dx + " " + obj.shape.polygon[i].dy;
            }
            s += " Z";
        }
        return s.trim();
    }

    function createTrajectoryPathString(obj) {
        let s = "";
        if (obj.trajectory.length > 1) {
            s = "M " + obj.trajectory[0].x + " " + obj.trajectory[0].y;
            for (let i = 1; i < obj.trajectory.length; i++) {
                s += " L" + obj.trajectory[i].x + " " + obj.trajectory[i].y + " ";
            }
        }
        return s.trim();
    }

    return {
        setFrameInfo: setFrameInfo,
        setRoi: setRoi,
        drawTrackedObjects: drawTrackedObjects,
        drawTrackedFaces: drawTrackedFaces,
        drawFireDetection: drawFireDetection,
        drawMotionMap: drawMotionMap
    }

});

const HTMLOverlay = (function(_cfg) {
    let log = LogFactory.getLogger('htmloverlay');
    const cfg = _cfg || {};
    const displaycfg = _cfg.displaycfg || {};
    const iconcontainer = document.querySelector('.html-overlay .icon-display');
    if (iconcontainer) {
        iconcontainer.innerHTML = "" +
            "<img class='alarmicon alarmicon-tracker' src='img/videooverlay/tracker-passive.png' />" +
            "<img class='alarmicon alarmicon-motion' src='img/videooverlay/motion.png' />" +
            "<img class='alarmicon alarmicon-audio' src='' />";
    }

    let icons = [
        { cls: "motion", alarmmask: 0x8000 },
        { cls: "flame", alarmmask: 0x40 },   //flame
        { cls: "smoke", alarmmask: 0x20 }    //smoke
    ];

    function drawIcons(alarmflags, domestate, audioalarm) {
        if (iconcontainer) {
        if (displaycfg.icons) {
            if (alarmflags) {
                var flags = (alarmflags.data[0] << 8) + alarmflags.data[1];
                for (let i = 0; i < icons.length; i++) {
                    if (typeof (icons[i].alarmmask) != 'undefined') {
                        if (flags & icons[i].alarmmask) {
                            iconcontainer.classList.add(icons[i].cls);
                        } else {
                            iconcontainer.classList.remove(icons[i].cls);
                        }
                    }
                }
            }
            if (domestate) {
                for (var i=0; i<TRACKER_STATES.length; i++) {
                    if (domestate.trackerstatus === TRACKER_STATES[i].state) {
                        iconcontainer.classList.add(TRACKER_STATES[i].cls);
                        iconcontainer.querySelector('.alarmicon-tracker').setAttribute('src', TRACKER_STATES[i].src);
                    } else {
                        iconcontainer.classList.remove(TRACKER_STATES[i].cls);
                    }
                }
            }
            if (audioalarm) {
                // show audioalarm for some sec
                // if (audioalarm.type >= 0 && audioalarm.timestamp > new Date().getTime() - 10000) {
                if (audioalarm.type >= 0) {
                    iconcontainer.classList.add('audio');
                    let found = false;
                    for (var i = 0; i < AUDIO_ALARM_TYPES.length; i++) {
                        if (audioalarm.type === AUDIO_ALARM_TYPES[i].type) {
                            found = true;
                            iconcontainer.querySelector('.alarmicon-audio').setAttribute('src', AUDIO_ALARM_TYPES[i].src);
                        }
                    }
                    if (!found) {
                        iconcontainer.querySelector('.alarmicon-audio').setAttribute('src', ICON_SRC.unclassifiednoise);
                    }
                } else {
                    iconcontainer.classList.remove('audio');
                }
            }
        } else {
            iconcontainer.classList.remove("motion", "flame", "smoke");
        }
       }
    }

    return {
        drawIcons: drawIcons
    }

});

let ParseUtils = (function() {

    function getObjById(obj, id) {
        // console.log("get obj id '" + id + "' out of ", obj);
        for (var i = 0; i < obj.length; i++) {
            if (obj[i].id == id || obj[i].idx == id) {
                return obj[i];
            }
        }
        return null;
    }
    return {
        getObjById: getObjById
    }
})();
