from matplotlib import path

lanes =[]

def setLanes(pointSets):
    global lanes
    for pointSet in pointSets:
        pathPoints = [(pointSet[0][i], pointSet[1][i]) for i in range(0, len(pointSet[0]))]
        lanes.append(path.Path(pathPoints))

def whichLane(coordinate: tuple[float]):
    i = 0
    for lane in lanes:
        if lane.contains_points([coordinate]):
            return i
        i += 1
    
    return -1