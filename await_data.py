import json
import os
import time
import re

def await_data() -> list | None:
    data = []
    targetFile = ''
    # Check for data(set a timer so busy waiting isn't happening)
    while True:
        found = False
        for fileName in os.listdir():
            if re.search(r'CameraData.json', fileName):
                targetFile = fileName
                found = True
                break
        if found: break
        time.sleep(10)
    # if the json file exists, read it and return its values
    with open(fileName) as f:
        data = json.loads(f.read())

    os.remove(fileName)

    cameraLocation = fileName[:-15]

    return data, cameraLocation