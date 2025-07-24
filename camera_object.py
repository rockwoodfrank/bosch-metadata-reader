from datetime import datetime

# Camera object
# UTC Timestamp
# Object ID
# Bounding box
# Center of gravity - could just be calculated no?
# Polygon data - ignore?
# Object Type
# Type Likelihood
# Location?
# Speed
# Idle?
# Lane?

class CameraObject():
    def __init__(self, id, timestamp):
        self.id = id
        if type(timestamp) == str:
            self.timestamp = datetime.fromisoformat(timestamp)
        elif type(timestamp) == datetime:
            self.timestamp = timestamp
        # TODO: Include support for other timestamp types?
        else: raise ValueError
        # Bottom, top, right, left
        self.boundingBox = (0,0,0,0)
        self.centerOfGravity = (0,0)
        self.numberOfUpdates = 1
        self.modified = 1
        self.idle = 0
        # path?

        # DATA TO RETURN TO OTHER PROGRAMS
        # timestamp
        self.timeElapsed = 0
        # TODO: make this more flexible
        self.detectedType = "None"
        self.detectionCertainty = 0.0
        # TODO: Change to zero? make zones start at 1?
        self.lane = -1
        self.speed = 0.0

    
    def merge_object(self, oldObject: 'CameraObject'):
        self.numberOfUpdates += 1
        # TODO: object type replacement - right now it gets the latest becuase the camera ususally gets the type right later on
        self.detectedType = oldObject.detectedType
        self.detectionCertainty = self.get_running_average(self.detectionCertainty, oldObject.detectionCertainty)
        self.speed = self.get_running_average(self.speed, oldObject.speed)
        self.lane = self.get_running_average(self.lane, oldObject.lane)

    
    def get_running_average(self, oldValue, newValue):
        return (oldValue * ((self.numberOfUpdates-1)/self.numberOfUpdates)) + (newValue / self.numberOfUpdates)
    
    def set_bounding_box_xml(self, boundingBoxObject):
        self.boundingBox = (float(boundingBoxObject.get("bottom")), float(boundingBoxObject.get("top")), float(boundingBoxObject.get("right")), float(boundingBoxObject.get("left")))
    
    def set_centerofgravity_xml(self, centerOfGravityObject):
        self.centerOfGravity = (float(centerOfGravityObject.get("x")), float(centerOfGravityObject.get("y")))

    def add_data(self, objectData):
        self.numberOfUpdates += 1
        self.modified = 1
        if type(objectData) == dict:
            self.detectedType = self.get_running_average(self.detectedType, objectData["type"])
            if objectData["lane"] >= 0:
                self.lane = self.get_running_average(self.lane, objectData["lane"])
            self.speed = self.get_running_average(self.speed, objectData["speed"])
            self.idle = self.get_running_average(self.idle, objectData["idle"])
        elif type(objectData) == CameraObject:
            self.merge_object(objectData)

    def get_data(self) -> dict:
        dataDict = {}
        dataDict["timestamp"] = self.timestamp
        dataDict["time_elapsed"] = self.timeElapsed
        dataDict["detected_type"] = self.detectedType
        dataDict["detection_certainty"] = self.detectionCertainty
        dataDict["lane"] = self.lane
        dataDict["speed"] = self.speed
        return dataDict
        

    def __str__(self):
        return f"{self.id}: {self.timestamp}, {self.detectedType}, lane {self.lane}, {self.speed}, {self.idle}, Updated {self.numberOfUpdates} times"

