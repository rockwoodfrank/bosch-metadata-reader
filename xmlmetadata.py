from bs4 import BeautifulSoup
import re
from camera_object import CameraObject
from pointSearch import setLanes, whichLane

# TODO: Drop the packet if there's an error
threshold = 0.379
lanes = (([0.828, -0.125, -0.203, 0.516],[-1, threshold, threshold, -1]), ([0.513, -0.20625, -0.281, 0.219], [-1, threshold, threshold,-1]), ([1, 0.031, -0.047, 1],[-0.495,threshold,threshold, -0.732]), ([1, 0.109, 0.034, 1],[-0.263,threshold,threshold, -0.489]))
setLanes(lanes)
speedFactor = 2.237

def parseXml(inputData):
    frameObjects = []
    try:
        xmlSoup = BeautifulSoup(inputData, 'xml')
        videoFrame = xmlSoup.Frame
        timestamp = videoFrame.get('UtcTime')
        for roadObject in videoFrame.find_all("Object"):
            currentObject = CameraObject(roadObject.get("ObjectId"), timestamp)
            currentObject.set_bounding_box_xml(roadObject.BoundingBox)
            currentObject.set_centerofgravity_xml(roadObject.CenterOfGravity)
            currentObject.detectedType = roadObject.VehicleInfo.Type.string
            currentObject.detectionCertainty = float(roadObject.VehicleInfo.Type.get("Likelihood"))
            currentObject.speed = float(roadObject.Speed.string) * speedFactor
            currentObject.lane = whichLane(currentObject.centerOfGravity)
            if currentObject.centerOfGravity[1] <= threshold:
                frameObjects.append(currentObject)
        
        return frameObjects
    except Exception as error:
        print(error)
        return None
    