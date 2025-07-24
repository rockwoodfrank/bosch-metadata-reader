from bs4 import BeautifulSoup
import re
from camera_object import CameraObject

# TODO: Drop the packet if there's an error
speedFactor = 2.237

def parseXml(inputData, threshold, whichLane):
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
    