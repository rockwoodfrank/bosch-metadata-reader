import matplotlib.pyplot as plt
import matplotlib.animation as animation
import matplotlib.patches as patches

from pointSearch import setLanes, whichLane
from camera_object import CameraObject

carsList = []
annotations = []
fig, ax = None, None 
data =[]


def update(i):
    global carsList, annotations
    for rect in carsList:
        rect.remove()
    carsList = []
    for line in annotations:
        line.remove()
    annotations = []
    
    objs = data.pop(0)
    display_metadata(objs[1])
    pass


def graphFile(inputData):
    global data
    data = inputData
    # cameraplot = ax.imshow(cameraView[::-1], origin='lower')

    ax.set(xlim=[0,640], ylim=[0,360])

    lanes = (([585,280,255,485],[0,262,262,0]), ([484, 254, 230, 390], [0,262,262,0]), ([640, 330, 305,640],[96,262,262,51]), ([640, 355, 331, 640],[140,262,262,97]))

    setLanes(lanes)

    ax.fill(lanes[0][0],lanes[0][1], alpha = 0.5)
    ax.fill(lanes[1][0],lanes[1][1], facecolor = "green", alpha = 0.5)
    ax.fill(lanes[2][0],lanes[2][1], facecolor = "red", alpha = 0.5)
    ax.fill(lanes[3][0],lanes[3][1], facecolor = "yellow", alpha = 0.5)

    ani = animation.FuncAnimation(fig, update, interval = 5)
    plt.show()


# def start_graph():
#     global fig, ax
#     fig, ax = plt.subplots()
#     ax.set(xlim=[0,640], ylim=[0,360])


def graph_cameraObjects(roadObjects: list[CameraObject]):
    global fig, ax
    if plt.fignum_exists(1):
        # plt.clf()
        ax.clear()
        ax.set(xlim=[-1,1], ylim=[-1,1])
        pass
    else:
        plt.ion()
        fig = plt.figure()
        ax = fig.add_subplot(111)

        ax.set(xlim=[-1,1], ylim=[-1,1])

        # plt.show()
    for roadObject in roadObjects:
        plt.plot(roadObject.centerOfGravity[0], roadObject.centerOfGravity[1], "bo")

    fig.canvas.draw()
    fig.canvas.flush_events()




def display_metadata(packets):
    frameInfo = list(filter(lambda x: x['type'] == 'frameinfo', packets))[0]
    # TODO: What to do if no frame info is displayed
    frameWidth = frameInfo['width']
    frameHeight = frameInfo['height']
    # print(frameWidth)
    ax.set(xlim=[0,frameWidth], ylim=[0,frameHeight])

    
    for packet in packets:
        if packet["type"] == "objectproperties":
            objType = ""
            position = (0,0)
            speed = 0
            idle = 0
            zerodata = []
            eightdata = []
            for obj in packet["objects"]:
                if obj["typ"] == 0x06:
                    if obj["classid"] == 3: objType = "car"
                    elif obj["classid"] == 6: objType = "truck"
                    elif obj["classid"] == 5: objType = "bike"
                    else: objType = obj["classid"]
                elif obj["typ"] == 0x12:
                    # ax.plot(obj['bb']['y'],frameWidth - obj['bb']['x'], 'bo')
                    position = (obj['bb']['x'],frameHeight-obj['bb']['y'])
                    centerDot = (obj['center']['x'] + position[0],  position[1] - obj['center']['y'])
                    rect = patches.Rectangle(position, obj['bb']['width'], -1 * obj['bb']['height'], linewidth = 1, edgecolor='r', facecolor='none')
                    carsList.append(ax.add_patch(rect))
                    laneNum = whichLane(centerDot)
                    dotColor = "k"
                    if laneNum == 0: dotColor = "b"
                    elif laneNum == 1: dotColor = "g"
                    elif laneNum == 2: dotColor = "r"
                    elif laneNum == 3: dotColor = "y"
                    carsList.append(ax.plot(centerDot[0], centerDot[1], f'{dotColor}o')[0])
                elif obj["typ"] == 22:
                    # Object speed
                    speedvals = (obj["data"]["0"], obj["data"]["1"])
                    speed = ((speedvals[0] << 8) + speedvals[1]) / 100 * 2.2369 * 1.7
                elif obj["typ"] == 30:
                    # Is the object stationary or not
                    idle = obj["data"]["0"]
                elif obj["typ"] == 0:
                    rawnums = obj["data"]
                    zerodata.append(rawnums["0"])
                    zerodata.append(rawnums["1"])
                    zerodata.append(rawnums["2"])
                    zerodata.append(rawnums["3"])
                    zerodata.append(rawnums["4"])
                    zerodata.append(rawnums["5"])
            annotations.append(ax.annotate(f"{objType} - {packet["id"]}", position))
