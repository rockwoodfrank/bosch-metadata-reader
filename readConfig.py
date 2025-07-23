
'''
Store the url and password in a seperate file to prevent it from being revealed
'''
def readAddress():
    address = ""
    with open("connection.config") as file:
        address = file.readline().strip()

    return address