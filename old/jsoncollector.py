from await_data import await_data
from objsParse import parse_metadata
from collectData import pushObjectData

def main():
    while True:
        data, cameraLocation = await_data()
        if data == None:
            return
        print(cameraLocation)
        for packet in data:
        # for i in range(0, 100):
            cameraObjects = parse_metadata(packet)
            # cameraObjects = parse_metadata(data[i])
            # put the data into the storage queue
            pushObjectData(cameraObjects, cameraLocation)
    
    
if __name__ == "__main__":
    main()
