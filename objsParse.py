from pointSearch import setLanes, whichLane

# Detection threshold - only count objects if they are below this level
threshold = 262
lanes = (([585,280,255,485],[0,262,262,0]), ([484, 254, 230, 390], [0,262,262,0]), ([640, 330, 305,640],[96,262,262,51]), ([640, 355, 331, 640],[140,262,262,97]))

setLanes(lanes)

def parse_metadata(packetsandTimestamp):
    packets = packetsandTimestamp[0]
    timestamp = packetsandTimestamp[1]
    frameInfo = list(filter(lambda x: x['type'] == 'frameinfo', packets))[0]
    # TODO: What to do if no frame info is displayed
    # TODO: Handle the changing of frame data or assume that it will always be the same?
    frameWidth = frameInfo['width']
    frameHeight = frameInfo['height']

    detectedObjects = []
    
    for packet in packets:
        if packet["type"] == "objectproperties":
            newObject = {}
            position = (0,0)
            for obj in packet["objects"]:
                if obj["typ"] == 0x06:
                    # objType = ""
                    # if obj["classid"] == 3: objType = "car"
                    # elif obj["classid"] == 6: objType = "truck"
                    # elif obj["classid"] == 5: objType = "bike"
                    # else: objType = obj["classid"]
                    newObject["type"] = obj["classid"]
                elif obj["typ"] == 0x12:
                    position = (obj['bb']['x'],frameHeight-obj['bb']['y'])
                    centerDot = (obj['center']['x'] + position[0],  position[1] - obj['center']['y'])
                    newObject["lane"] = whichLane(centerDot)
                    newObject["centerPos"] = centerDot
                elif obj["typ"] == 22:
                    # Object speed
                    speedvals = (obj["data"][0], obj["data"][1])
                    # NOTE: Speed is currently an estimation
                    newObject["speed"] = ((speedvals[0] << 8) + speedvals[1]) / 100 * 2.2369 * 1.7
                elif obj["typ"] == 30:
                    # Is the object stationary or not
                    newObject["idle"] = obj["data"][0]

            newObject["id"] = packet["id"]
            newObject["timestamp"] = timestamp
            if position[1] <= threshold:
                detectedObjects.append(newObject)


    return detectedObjects