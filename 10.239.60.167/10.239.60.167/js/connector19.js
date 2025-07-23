connectors[VideoBase.DECODER.VIDEOTAG_MSL] = function() {

    var m_id = null,
        m_params = {},
        m_parentId = "",
        m_videotag = null,
        m_videocanvas = null,
        m_metacnv = null,
        m_svgoverlay = null,
        m_metadataprocessor = null,
        m_picinfoprocessor = null,
        m_mse = null,
        m_pipeline = null,
        m_sessionid = 0,
        m_session_random = "",
        m_line = 1,
        m_stream = 1,
        m_delay_ms = 0,
        m_audiobackchannel,
        m_connecting = false,
        m_audiobackchannelstate = 'disconnected',
        m_reconnect = {
            count: 0,
            max: 1,
            timeouthandle: 0,
            reconnectTimeout: 5000
        },
        m_fur_handle = 0,
        m_update_sid_handle = 0,
        m_debugmode = sessionStorage.getItem('debug') != null,
        m_log = LogFactory.getLogger('connector19');


    var m_socketClosedhandler = (function (evt) {
        console.log("socket closed: ", evt);
        if (evt.code === 1006 && m_mse) {
            reconnectDelayed();
        }
    });

    var m_infohandler = (function () {
        var m_videoformat = {
            width: 0,
            height: 0
        };
        var processInfo = function (msg) {
            if (m_mse && m_mse.sourceBuffers.length > 0) {
                /*
                if (m_mse.sourceBuffers[0].mode !== 'sequence')  {
                    console.log("update mode")
                    m_mse.sourceBuffers[0].mode = 'sequence';
                }
                 */
                if (m_mse.sourceBuffers[0].buffered.length > 0) {
                    try {
                        m_delay_ms = Math.round((m_mse.sourceBuffers[0].buffered.end(0) - m_videotag.currentTime) * 1000);
                    } catch (e) {
                        console.log('error getting delay: ', e.message);
                    }
                } else {
                    // no buffers to detect delay
                    m_delay_ms = 0;
                }
            }
            $('.streaminfo-display .delay').text(m_delay_ms + 'ms');
            if (msg.video) {
                $('.streaminfo-display .row-video').show();
				var txt = msg.video.codec.coding;
				if (msg.video.width) txt += ' - ' + msg.video.width + 'x' + msg.video.height;
                $('.streaminfo-display .videoformat').text(txt);
                if (m_videoformat.width != msg.video.width || m_videoformat.height != msg.video.height) {
                    m_videoformat.width = msg.video.width;
                    m_videoformat.height = msg.video.height;
                    $(window).trigger('videoResolutionChanged', {x: msg.video.width, y: msg.video.height});
                }
				if (msg.video.codec.coding === 'H265') {
				    if (typeof showOverlay === 'function') {
                        showOverlay(GUITranslator.getMessage('no_h265_overlay'));
                    } else if (typeof showTempMsg === 'function') {
                        showTempMsg(GUITranslator.getMessage('no_h265_overlay'), { timeout: 5000 });
                    }
				}
            } else {
                $('.streaminfo-display .row-video').hide();
            }
            if (msg.audio) {
                $('.streaminfo-display .row-audio').show();
                var txt = msg.audio.codec.coding;
                if (msg.audio.codec.samplingrate) txt += ' ' + msg.audio.codec.samplingrate;
                $('.streaminfo-display .audioformat').text(txt);
            } else {
                $('.streaminfo-display .row-audio').hide();
            }
            $('.streaminfo-display .kbps').text(Math.round(msg.kbit_sec) + ' kbps');
            try {
                let framerate = m_pipeline.framerate;
                $('.streaminfo-display .fps').text(Number(framerate).toFixed(2) + ' fps');
            } catch (e) {
                console.log('error getting framerate', e)
            }
            // restart video when delay is too large
            if (m_delay_ms > 3000 && !m_params.recording) {
                if (m_reconnect.count < m_reconnect.max) {
                    console.log('reconnecting because of delay of ' + m_delay_ms + ' ms (count: ' + m_reconnect.count + ')');
                    connect();
                    m_reconnect.count++;
                }
            }
        };

        let processSei = function (msg) {
            let roi = msg.get(0x85);
            if (roi) {
                if (m_metadataprocessor && m_metadataprocessor.setRoi) {
                    m_metadataprocessor.setRoi(roi.parsed.tl.x, roi.parsed.tl.y, roi.parsed.br.x, roi.parsed.br.y)
                }
            }
        };

        return {
            processInfo: processInfo,
            processSei: processSei
        }
    })();

    var m_metadatahandler = (function() {
        var processMsg = function(msg) {
            if (m_metadataprocessor) {
                window.setTimeout(function() {
                    m_metadataprocessor.processMsg(msg)
                }, m_delay_ms)
            }
        };

        return {
            processMsg: processMsg
        }
    })();

    function addVideo(id, attributes, params) {
        if(!params) params = {};
        if(!attributes) attributes = {id: "video"};
        else if(!attributes.id) attributes.id = "video";
        m_parentId = id;
        m_id = attributes.id;
        var muted = LocalStorageMgr.getValue(LocalStorageMgr.TRANSMIT_AUDIO) ? "" : " muted";
        var video = "<video " + VideoBaseUtils.getAttributeString(attributes) + muted + " autoplay></video>";
        var videocnv = "<canvas id = '" + m_id + "_canvas' class='videocanvas'></canvas>";
        var overlay = "<canvas id='" + m_id + "_meta' class='videooverlay'></canvas>";
        var htmloverlay = "<div class='html-overlay'><div class='picinfo-display'></div><div class='icon-display'></div></div>";
        var streaminfo_icon = "<div class='streaminfo-icon icon min'></div>";
        var streaminfo = "<div class='streaminfo-display min'>" + getStreamInfoTemplate() + "</div>";
        var picinfo = "<div class='picinfo-display'></div>";
        var temporaryMsg = "<div class='temp-msg off'><div></div></div>";
        //var videocontrols = "<div class='video-controls'><div class='playbutton'>&#xE755</div></div>";
        var videocontrols = "<svg class='video-controls' viewBox='0 0 1000 1000' preserveAspectRatio='xMidYMid'>";
        videocontrols += "<polygon points='490,450 580,500 490,550' />";
        videocontrols += "<circle cx='520' cy='500' r='100' />";
        videocontrols += "</svg>";
        var svgoverlay = "<svg id='" + m_id + "_meta' class='svg-overlay' viewBox='0 0 1 1' preserveAspectRatio='none'></svg>";
        // svgoverlay = "";
        overlay = "";

        $("#"+id).html("<div class='connector-container msl'>" + video + videocnv + htmloverlay + overlay + svgoverlay + temporaryMsg + videocontrols + streaminfo_icon + streaminfo + "</div>");
        $("#" + m_id + "_canvas").hide();

        if (m_debugmode) {
            $("#"+id).find('.connector-container').addClass('debug');
        }

        $('.connector-container .playbutton, .connector-container .video-controls').on('click', function() {
            connect();
        });
        $('.connector-container .streaminfo-display .close-info').on('click', function() {
            $('.connector-container .streaminfo-display').addClass('min');
            $('.connector-container .streaminfo-icon').addClass('min');
        });
        $('.connector-container .streaminfo-icon').on('click', function() {
            $('.connector-container .streaminfo-display').removeClass('min');
            $('.connector-container .streaminfo-icon').removeClass('min');
        });
        $('.connector-container .streaminfo-display .reconnect').on('click', function() {
            disconnect();
            connect();
        });
        m_reconnect.count = 0;
        if (!window.showTempMsg) {
            window.showTempMsg = showTemporaryMessage;
        }
        return attributes.id;
    }

    function reconnectDelayed() {
        window.clearTimeout(m_reconnect.timeouthandle);
        disconnect();
        m_reconnect.timeouthandle = window.setTimeout(() => {
            console.log("reconnecting...");
            connect();
        }, m_reconnect.reconnectTimeout);
    }

    function updateBackupParams(name, value) {
        m_params[name] = value;
    }

    function connect(params) {
        if (typeof(mediaStreamLibrary) === 'undefined') {
            console.log('no mediastreamlibrary available');
            return;
        }
        params = params || m_params;
        m_params = params;
        m_mse = null;
        m_connecting = true;
        m_sessionid = 0;
        m_videotag = $("#" + m_parentId + " video")[0];
        m_videocanvas = $("#" + m_parentId + " .videocanvas")[0];
        m_metacnv = $("canvas#"+m_id+"_meta")[0];
        m_svgoverlay = $("svg#"+m_id+"_meta")[0];
        if(typeof(params.line)!="undefined") m_line = params.line;
        if(typeof(params.stream)!="undefined") m_stream = params.stream;
        // var isJpeg = (m_stream === 3);
        var isJpeg = (m_params.videocodec === VideoBase.CONSTANTS.JPEG);
        var resetOverlay = ($(m_videotag).attr('id') === 'video' && isJpeg) ||
            ($(m_videocanvas).attr('id') === 'video' && !isJpeg);
        if(resetOverlay) {
            m_log('destroy overlay because of video type change');
            PTZOverlayMgr.getInstance().destroyOverlay("video")
        }
        $(m_videotag).attr('id', isJpeg ? 'video_unused' : 'video');
        $(m_videocanvas).attr('id', isJpeg ? 'video' : 'video_unused');
        $(m_videotag).off("canplay error progress stalled pause timeupdate");
        if(!isJpeg) {
            $(m_videotag).on("canplay", function (evt) {
                canPlayReceived();
            }).on("error", function (evt) {
                console.log("video element error: ", evt, m_videotag.error);
                if (m_videotag.error.code === 3 && m_params.audio) {
                    // 3 == Decode Error, try without audio
                    if (m_params.audio_aac_bitrate === 80000) {
                        m_log("AAC 80kbps not supported, reconnecting without audio");
                        // showTempMsg(GUITranslator.getMessage('reconnecting_without_audio'), {timeout: 4000});
                    } else {
                        m_log("video tag error received, trying to reconnect without audio");
                    }
                    disconnect();
                    m_params.audio = false;
                    m_videotag.muted = true;
                    connect();
                }
            }).on("progress", function (evt) {
                // console.log("progress: ", evt.timeStamp);
                $(window).trigger('VideoTagProgress', {src: 'MSL', sec: evt.timeStamp/1000});
            }).on("stalled", function (evt) {
                console.log("stalled: ", evt);
            }).on("pause", function (evt) {
                console.log('pause');
                if (!m_connecting) {
                    let tmpState = ConnectionStateMgr.getCurrentState(m_id);
                    if (tmpState && tmpState.established) {
                        disconnect();
                    }
                } else {
                    // console.warn("pause received while connecting !!!")
                }
            }).on("timeupdate", function (evt) {
                // $('.video-controls').hide();
            });
        }

        var rtspurl = params.rtspurl || "rtsp://127.0.0.1/rtsp_tunnel?";
        var tmpStream = params.stream || 1;
        if (!CamFeatures.getCapability(CamFeatures.CODER_SPEC_ENC_PROF)) {
            if (isJpeg) {
                rtspurl += "h26x=0";
                tmpStream = 1;
            } else {
                //IFrame only stream --> inst 3
                if (tmpStream === 4) {
                    tmpStream = 3;
                    params.vcameta = false;
                    params.trajectories = false;
                }
                rtspurl += "h26x=4";
            }
        }
        if (!rtspurl.match(/\?$/)) rtspurl += "&";
        rtspurl += "line=" + params.line || 1;
        rtspurl += "&inst=" + tmpStream;
        if (params.recording) {
            // rtspurl += "&rec=1";
            rtspurl += "&rec=1&live=1";
        } else {
            rtspurl += "&rec=0";
        }
        if(params.vcameta || params.trajectories || params.icons) {
            rtspurl += "&vcd=1";
        }

        if(params.audio) {
            rtspurl += "&enableaudio=1&aacOut=1";
        } else {
            rtspurl += "&enableaudio=0";
        }

        // rtspurl += "&auth=1";

        if(params.transcodermode) rtspurl += "&tc=1";

        m_session_random = getRandomNumber(1, 65535);
        rtspurl += "&skipbframes=1&skipsei=0&rnd=" + m_session_random;

        m_log("video url: ", rtspurl);

        if (params.audio && m_videotag) {
            m_videotag.muted = false;
        }

        if (sessionStorage.getItem('rtspurl')) {
            rtspurl = sessionStorage.getItem('rtspurl');
            console.log('using url for debugging: ', rtspurl)
        }

        var wspath = UrlHelper.getAbsUrlToFile({
            protocol: UrlHelper.getCurrentUrlData().isHttps ? "wss" : "ws",
            file: "websocket/rtsp_tunnel"
        });
        m_log('ws: ', wspath);

        var metadatatype = '';

        // clean up
        let svgoverlay = document.querySelector('.svg-overlay');
        if (svgoverlay) svgoverlay.innerHTML = '';
        let picinfo = document.querySelector('.picinfo-display');
        if (picinfo) picinfo.innerHTML = '';
        let icons = document.querySelector('.icon-display');
        if (icons) icons.innerHTML = '';

        if (rtspurl.indexOf('vcd=2') > 0) {
            metadatatype = 'ONVIF';
            m_metadataprocessor = new OnvifMetadataProcessor({
                cnv: m_metacnv,
                svgoverlay: m_svgoverlay,
                debug: m_debugmode
            })
        } else if (rtspurl.indexOf('vcd=1') > 0) {
            metadatatype = 'BOSCH';
            m_metadataprocessor = new BoschMetadataProcessor({
                cnv: m_metacnv,
                svgoverlay: m_svgoverlay,
                debug: m_debugmode,
                displaycfg: {
                    shapes: params.vcameta,
                    trajectories: params.trajectories,
                    boxes: params.vcameta ? 'auto' : false,
                    faces: params.vcameta,
                    icons: params.icons
                }
            })
        }

        if (rtspurl.indexOf('auth=1') > 0) {
            m_picinfoprocessor = new PicInfoProcessor({
                htmlelem: $('.picinfo-display').get(0)
            });
        }

        var pipelinecfg = {
            ws: { uri: wspath, protocol: 'binary' },
            rtsp: { uri: rtspurl },
            mediaElement: isJpeg ? m_videocanvas : m_videotag
        };

        if (m_metadataprocessor) {
            pipelinecfg.metadataHandler = m_metadatahandler.processMsg;
            pipelinecfg.metadataType = metadatatype;
        }

        if (m_picinfoprocessor) {
            pipelinecfg.picinfoHandler = m_picinfoprocessor.processMsg;
        }

        if (m_infohandler) {
            pipelinecfg.streaminfoHandler = m_infohandler.processInfo;
            pipelinecfg.seiinfoHandler = m_infohandler.processSei;
        }

        if (m_socketClosedhandler) {
            pipelinecfg.socketClosedHandler = m_socketClosedhandler;
        }

        if (params.recording) {
            pipelinecfg.timestampJumpFactor = 5;
        }

        if (isJpeg) {
            // jpeg mode
            $("#" + m_parentId + " video").hide();
            $("#" + m_parentId + " .videocanvas").show();
            $("#" + m_parentId + " .video-controls").hide();
            if (mediaStreamLibrary.pipelines.Html5CanvasBoschPipeline) {
                m_pipeline = new mediaStreamLibrary.pipelines.Html5CanvasBoschPipeline(pipelinecfg);
            } else {
                m_pipeline = new mediaStreamLibrary.pipelines.Html5CanvasMetadataPipelineExtended(pipelinecfg);
            }
            m_pipeline.onCanplay = function() {
                canPlayReceived();
            }
        } else {
            // h264 mode
            $("#" + m_parentId + " .videocanvas").hide();
            $("#" + m_parentId + " video").show();
            if (mediaStreamLibrary.pipelines.Html5VideoBoschPipeline) {
                m_pipeline = new mediaStreamLibrary.pipelines.Html5VideoBoschPipeline(pipelinecfg);
            } else {
                m_pipeline = new mediaStreamLibrary.pipelines.Html5VideoMetadataPipelineExtended(pipelinecfg);
            }
        }

        m_pipeline.onSourceOpen = function(mse, tracks) {
            m_mse = mse;
            var dTmp = parseFloat(sessionStorage.getItem('mseduration'));
            if (isNaN(dTmp)) {
                // MS Edge needs a little bit delay for stable video
                dTmp = isEdge() ? 0.1 : 0;
            }
            if (dTmp >= 0) {
                mse.duration = dTmp;
                console.log("set mse duration to ", dTmp);
            } else {
                console.log("no mse duration set");
            }
        };

        m_pipeline.ready.then(function() {
            m_pipeline.rtsp.play();
            // m_videotag.play();
        }, function(res) {
            console.log("connection failed: ", res);
            reconnectDelayed();
        });

        $(m_videotag).add(m_videocanvas).off("videoresized").on("videoresized", function() {
            var w = $(this).width();
            var h = $(this).height();
            var l =  $(this).position().left;
            $(m_metacnv).attr({ "width": w+"px", "height": h+"px"}).css({ "width": w+"px", "height": h+"px", "left": l+"px" });
            $(m_svgoverlay).attr({ "width": w+"px", "height": h+"px"}).css({ "width": w+"px", "height": h+"px", "left": l+"px" });
            (w > h) ? $('.html-overlay').removeClass('vertical') : $('.html-overlay').addClass('vertical');
            if (m_metadataprocessor) {
                m_metadataprocessor.resized();
            }
            if (FullscreenSupport.isFullScreen()) {
                var dx = 0, dy = 0;
                if (h < screen.height) dy = (screen.height - h) / 2;
                // else if (w < screen.width) dx = (screen.width - w) / 2;
                $('#' + m_parentId).find('#video, #video_unused, #video_meta, #video_overlay').css('transform', 'translate(' + dx + 'px,' + dy + 'px)');
            } else {
                $('#' + m_parentId).find('#video, #video_unused, #video_meta, #video_overlay').css('transform', 'none');
            }
        });
        $(m_videotag, m_videocanvas).trigger("videoresized");

        // // listener on browser tab
        // $(document).off('visibilitychange').on('visibilitychange', function () {
        //     if (document.hidden) {
        //         m_pipeline && m_pipeline.close();
        //         // $('.video-controls').show();
        //     } else {
        //         if (document.getElementById(m_id) && document.getElementById(m_id).parentElement.classList.contains('msl')) {
        //             if ($('.resetblock').length === 0) {
        //                 connect();
        //             }
        //         }
        //     }
        //     if (typeof(browserTabActivated) === 'function') {
        //         browserTabActivated(!document.hidden);
        //     }
        // });

        if (m_fur_handle) window.clearInterval(m_fur_handle);
        /*
        if (!m_params.recording) {
            checkIFrameDist(LineInfo.getPhysicalVideoLineForLine(m_line), m_stream).done(function (res) {
                if (res.iframedist == 0 || res.ifps < 0.1) {
                    console.log('ifps too low, requesting furs (' + res.ifps + ')');
                    m_fur_handle = window.setInterval(requestIFrame, 5000);
                }
            })
        }
         */
    }

    function canPlayReceived() {
        m_connecting = false;
        $('.video-controls').hide();
        if (m_pipeline.lastComponent._videoEl) {
            var playPromise = m_videotag.play();
            if (playPromise) {
                playPromise.catch(function (e) {
                    // 2nd try
                    m_log('1st try play failed: ' + e.message);
                    window.setTimeout(() => {
                        m_videotag.play().catch((e) => {
                            m_log('play failed: ' + e.message);
                            disconnect();
                        })
                    }, 300);
                });
            }
        }
        if(m_sessionid === 0) {
            window.clearTimeout(m_update_sid_handle);
            m_update_sid_handle = window.setTimeout(function() {
                updateSessionID().done(function (res) {
                    if (res.oldsessionid !== res.newsessionid) {
                        $("#" + m_parentId).trigger('firstFrameReceived');
                    }
                });
            }, 500);
        }
    }

    function getStreamInfoTemplate() {
        var s = "";
        s += "<div class='row row-delay'><label class='label'>" + GUITranslator.getMessage("Delay:") + "</label><div class='value delay'></div></div>";
        s += "<div class='row row-video'><label class='label'>" + GUITranslator.getMessage("Video:") + "</label><div class='value videoformat'></div></div>";
        s += "<div class='row row-audio'><label class='label'>" + GUITranslator.getMessage("Audio:") + "</label><div class='value audioformat'></div></div>";
        s += "<div class='row row-framerate'><label class='label'>" + GUITranslator.getMessage("Framerate:") + "</label><div class='value fps'></div></div>";
        s += "<div class='row row-datarate'><label class='label'>" + GUITranslator.getMessage("Datarate:") + "</label><div class='value kbps'></div></div>";
        s += "<div class='row row-reconnect'><a class='label reconnect'>" + GUITranslator.getMessage("Reconnect") + "</a></div>";
        s += "<span class='icon close-info'></span>";
        return s;
    }

    function checkIFrameDist(line, stream) {
        var def = jQuery.Deferred();
        new EncProfileMgr().getVinFormat(line).done(function(res) {
            var framerate = res.framerate;
            RCP.readCommand(RCPCommands.CONF_VIDEO_H264_ENC_CURRENT_PROFILE, { rcpnum: line }).done(function(res) {
                var curprofile = res.parsed[stream-1]
                //iframe dist
                var num = curprofile;
                if (CamFeatures.getCapability(CamFeatures.CODER_SPEC_ENC_PROF)) {
                    num = (GetMPEG4EncoderNumber(line, stream) << 8) | curprofile;
                }
                RCP.readRCP(0x0604, "T_DWORD", { rcpnum: num }).done(function(res) {
                    var iframedist = res.value;
                    //skip
                    RCP.readRCP(0x0606, "T_DWORD", { rcpnum: num }).done(function(res) {
                        var skip = res.value;
                        var ifps = ((framerate / 1000) / skip) / iframedist;
                        def.resolve({
                            framerate: framerate,
                            curprofile: curprofile,
                            iframedist: iframedist,
                            skip: skip,
                            ifps: ifps
                        })
                    }).fail(function(e) {
                        def.reject(e);
                    })
                }).fail(function(e) {
                    def.reject(e);
                })
            }).fail(function(e) {
                def.reject(e);
            });
        }).fail(function(e) {
            def.reject(e);
        });
        return def.promise();
    }

    function requestIFrame() {
        RCP.writeRCP(0x0605, "T_DWORD", 1,{rcpnum: 0, sessionid: m_sessionid, noglobalfinish: true})
    }

    function requestSDP() {
        m_pipeline.requestSDP();
    }

    function updateSessionID(params) {
        var def = jQuery.Deferred();
        var back = { oldsessionid: m_sessionid, newsessionid: m_sessionid };
        params = params || {};
        RCP.readRCP(0x0ae8, "T_DWORD", {rcpnum: m_session_random}).done(function(res) {
            if(res.value != m_sessionid) {
                console.log("session id: ", res.value);
                m_sessionid = res.value;
                $(window).add($("#" + m_parentId)[0]).trigger('SessionIdChanged', {
                    sessionid: unsign(m_sessionid),
                    line: m_line,
                    stream: m_stream,
                    srcid: m_id
                });
                if (typeof params.sessionIdChanged == 'function') {
                    params.sessionIdChanged(m_sessionid);
                }
                ConnectionStateMgr.stateChanged(m_id, m_line, m_stream, m_sessionid!=0, m_sessionid, VideoBase.DECODER.VIDEOTAG_MSL);
                back.newsessionid = m_sessionid;
            } else {
                //console.log("same session id: ", m_sessionid);
            }
            def.resolve(back);
        }).fail(function(e) {
            def.reject(e);
        });
        return def.promise();
    }

    function showFullscreen() {
        var container = $('#'+m_id).closest('.connector-container').get(0);
        FullscreenSupport.requestFullScreen(container);
    }

    function showTemporaryMessage(msg, cfg) {
        cfg = cfg || {};
        $('.temp-msg div').text(msg);
        $('.temp-msg div').attr( "class", cfg.cls || "");
        $('.temp-msg').removeClass('off');
        if (cfg.timeout) {
            window.setTimeout(function () {
                hideTemporaryMessage();
            }, cfg.timeout);
        }
    }

    function hideTemporaryMessage() {
        $('.temp-msg').addClass('off');
    }

    function disconnect() {
        if (m_pipeline) {
            console.log("disconnecting msl");
            m_pipeline && m_pipeline.close();
            m_mse = null;
            $('.video-controls').show();
            $(window).add($("#" + m_parentId)[0]).trigger('SessionIdChanged', {
                sessionid: 0,
                line: m_line,
                stream: m_stream,
                srcid: m_id
            });
            ConnectionStateMgr.stateChanged(m_id, m_line, m_stream, false, 0, VideoBase.DECODER.VIDEOTAG_MSL);
        }
        if (m_metadataprocessor) {
            m_metadataprocessor.reset();
        }
        window.clearInterval(m_fur_handle);
        window.clearTimeout(m_update_sid_handle);
    }

    function sendAudio(b) {
        if(b) {
            if (m_audiobackchannelstate != 'disconnected') {
                m_log('can not connect audio, current state = ' + m_audiobackchannelstate)
                return;
            }
            m_audiobackchannelstate = 'connecting';
            if (!m_audiobackchannel) {
                m_audiobackchannel = new AudioBackChannel();
            }
            showTempMsg(GUITranslator.getMessage('microphone_connecting'), {cls: 'wait'});
            m_audiobackchannel.connect().then(function (res) {
                console.log('backchannel connected');
                showTempMsg(GUITranslator.getMessage('microphone_connected'), {cls: 'mic'})
                m_audiobackchannelstate = 'connected';
            }).catch(function (res) {
                if (document.location.protocol === 'http:' && !AudioBackChannelHelper.checkMicrophoneAccess()) {
                    showTempMsg(GUITranslator.getMessage('no_microphone_https'), {timeout: 5000});
                } else if (res.name == 'NotFoundError') {
                    showTempMsg(GUITranslator.getMessage('no_microphone'), {timeout: 5000});
                } else if (res.message) {
                    showTempMsg(res.message, {timeout: 5000});
                } else {
                    hideTemporaryMessage();
                }
                console.log('backchannel connection failed: ',  res);
                m_audiobackchannelstate = 'disconnected';
            });
        } else {
            hideTemporaryMessage();
            if (m_audiobackchannelstate == 'connected') {
                if (m_audiobackchannel) {
                    m_audiobackchannel.disconnect();
                }
                m_audiobackchannelstate = 'disconnected';
            } else {
                // maybe the warning dialog popped up
                console.log("can not close audio, state: " + m_audiobackchannelstate);
            }
        }
    }

    function saveSnapshot(path) {
        downloadVideoTagSnapshot(m_id, path);
        return true;
    }

    return {
        addVideo: addVideo,
        connect: connect,
        disconnect: disconnect,
        sendAudio: sendAudio,
        showFullscreen: showFullscreen,
        saveSnapshot: saveSnapshot,
        updateBackupParams: updateBackupParams,
        type: VideoBase.DECODER.VIDEOTAG_MSL
    }

};
//# sourceURL=js/connector19.js
