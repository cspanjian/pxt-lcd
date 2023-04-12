
/**
 * NFC reader and write
 * 这个目前只能读写M1 S50卡，NTAG 213能读到uid，但是不能读写数据
 */
//% weight=10 color=#1d8045 icon="\uf0e7" block="NFC"
namespace NFC {
    let myNFCevent: Action = null;
    let receivedLen = 0;
    let receivedBuffer = pins.createBuffer(25);
    let uid = pins.createBuffer(4);
    let myRxPin=SerialPin.P14;
    let myTxPin=SerialPin.P13;
    let init=false;
    let pauseDetect = false; //如果正在执行检测到NFC卡的程序，则设置为true，避免不停的进入检测到NFC卡的程序
    //反正一直要用读取UID的cmd的，这里直接生成好存下来。直接把校验和填入，省去计算的时间
    let cmdUID = pins.createBufferFromArray([0x01, 0x08, 0xA1, 0x20, 0x00, 0x01, 0x00, -138])

    //% advanced=true shim=NFC::RxBufferedSize
    function RxBufferedSize(): number {
        return 1
    }

    /**
     * Setup DFRobot NFC module Tx Rx to micro:bit pins.
     * 这里的RX指的是读卡器上的RX和micro:bit连接的引脚，TX指的是读卡器的TX和micro:bit连接的引脚，不需要做TX和RX互换
     * @param pinTX to pinTX ,eg: SerialPin.P13
     * @param pinRX to pinRX ,eg: SerialPin.P14
    */
    //% weight=100
    //% blockId="NFC_setSerial" block="初始化NFC模块，NFC模块的 TX 连接到 %pinTX | RX 连接到 %pinRX"
    export function NFC_setSerial(pinTX: SerialPin, pinRX: SerialPin): void {
        myRxPin=pinRX;
        myTxPin=pinTX;
        serial.redirect(
            pinRX,
            pinTX,
            BaudRate.BaudRate9600
        )
        init=true;
    }

    //% weight=95
    //% blockId="NFC_disconnect" block="断开NFC模块"
    export function NFC_disconnect(): void {
        init=false;
    }

    //% weight=94
    //% blockId="NFC_reconnect" block="重新连接NFC模块"
    export function NFC_reconnect(): void {
        serial.redirect(
            myRxPin,
            myTxPin,
            BaudRate.BaudRate9600
        )
        init=true;
    }

    //% weight=90
    //% blockId="nfcEvent" block="当检测到NFC卡"
    export function nfcEvent(tempAct: Action) {
        myNFCevent = tempAct;
    }

    //% weight=80
    //% blockId="getUID" block="NFC卡的UID字符串"
    export function getUID(): string {
        serial.setRxBufferSize(50)
        let uidBuffer: number[] = []
        serial.writeBuffer(cmdUID);
        basic.pause(50);
        receivedLen = RxBufferedSize();
        if (receivedLen == 12) {
            receivedBuffer = serial.readBuffer(12);
            for (let i = 0; i < 4; i++) {
                uid[i] = receivedBuffer[7 + i];
            }

            uidBuffer = [uid[0], uid[1], uid[2], uid[3]];
            return convertString(uidBuffer, 4);
        } else {
            return "";
        }
    }

     //% weight=70
    //% blockId="cardInitialised" block="NFC模块已经初始化?"
    export function cardInitialised(): boolean {
        return init;
      }

    //% weight=70
    //% blockId="detectedRFIDcard" block="检测到NFC卡?"
    export function detectedRFIDcard(): boolean {
        serial.setRxBufferSize(50)
        serial.writeBuffer(cmdUID);
        basic.pause(50);
        receivedLen = RxBufferedSize();
        if (receivedLen == 12) {
            return true;
        } else {
            return false;
        }
    }

    //% weight=70
    //% myText
    //% blockId="writeStringToCard" block="向NFC卡写入字符串 %myText"
    export function writeStringToCard(myText: string): boolean {
        return sendStringToCard(myText);
    }

    //% weight=70
    //% blockId="readStringFromCard" block="从NFC卡读取字符串"
    export function readStringFromCard(): string {
        return getStringFromCard();
    }

    function getHexStr(myNum: number): string {
        let tempStr = "";
        if (myNum < 0x0A) {
            tempStr += myNum.toString();
        } else {
            switch (myNum) {
                case 0x0A:
                    tempStr += "A";
                    break;
                case 0x0B:
                    tempStr += "B";
                    break;
                case 0x0C:
                    tempStr += "C";
                    break;
                case 0x0D:
                    tempStr += "D";
                    break;
                case 0x0E:
                    tempStr += "E";
                    break;
                case 0x0F:
                    tempStr += "F";
                    break;
                default:
                    break;

            }
        }
        return tempStr;
    }

    function convertString(myBuffer: number[], len: number): string {
        let myStr = "";
        let temp = 0;
        for (let i = 0; i < len; i++) {
            temp = (myBuffer[i] & 0xF0) >> 4;
            myStr += getHexStr(temp);
            temp = (myBuffer[i] & 0x0F);
            myStr += getHexStr(temp);
        }
        return myStr;
    }

    /**
     * 把字符串写入到RFID卡里，最多只用6个block，一共96-2=94个byte，所以最少是31个字符（UTF-8格式）
     * 写入的字符串，末尾最后固定加上连续的2个0x00，从而让程序知道到了数据的尾部
     * 如果传入的字符串超过94个byte，则截断。截断的时候，最后未必有连续的2个0x00了
     * 数据块固定使用 0x04, 0x05, 0x06, 0x08, 0x09, 0x0A
     */
    function sendStringToCard(myText: string): boolean{
        let byteArr = Buffer.fromUTF8(myText);
        byteArr[byteArr.length] = 0x00;
        byteArr[byteArr.length] = 0x00;
        let byteArrLen = byteArr.length;
        let byteArrIndex = 0;
        for(let blockIndex=0x04;blockIndex<0x0B;blockIndex++){
            //跳过0x07，因为这个是密码块，不能存储用户数据
            if (blockIndex==0x07){
                continue;
            }
            let oneBlock: number[]=[]
            let i=0;
            for(;i<16;i++){
                if (byteArrIndex >= byteArrLen){
                    break; //数据已经写完了，必用再继续了
                }
                oneBlock[i] = byteArr[byteArrIndex++];
            }
            if(!writeOneBlock(oneBlock,blockIndex)){
                return false;
            }
            if(i<16){
                break; //表示当前块没填满，不用再继续填充和写数据了
            }
        }

        return true;
    }
    /**
     * myData是16个元素的数组，是要写入到一个block的数据
     */
    function writeOneBlock(myData: number[], blockNum: number): boolean{
        serial.setRxBufferSize(50)
        let myBuffer: number[]=[];
        myBuffer[0] = 0x01;
        myBuffer[1] = 0x17;
        myBuffer[2] = 0xA4;
        myBuffer[3] = 0x20;
        myBuffer[4] = blockNum;
        myBuffer[5] = 0x01;
        //把要发的数据复制到myBuffer
        for(let i=6;i<22;i++){
            myBuffer[i] = myData[i-6];
        }
        myBuffer[22] = 0x00;
        fillInCheckSum(myBuffer);
        let cmdWriteData = pins.createBufferFromArray(myBuffer)
        serial.writeBuffer(cmdWriteData);
        basic.pause(50);
        receivedLen = RxBufferedSize();
        if (receivedLen == 8) {
            receivedBuffer = serial.readBuffer(8);
            if(receivedBuffer[4] == 0x00){
                return true;
            }
        }
        return false;
    }

    /**
     * 把RFID卡里面的数据读出来，并转为字符串
     */
    function getStringFromCard():string{
        let byteArr: number[] = []
        for (let blockIndex = 0x04; blockIndex < 0x0B; blockIndex++) {
            //跳过0x07，因为这个是密码块，不能存储用户数据
            if (blockIndex == 0x07) {
                continue;
            }
            let oneBlock = readOneBlock(blockIndex);
            let oneBlockLen = oneBlock.length;
            if(oneBlockLen>0){
                let byteArrLen = byteArr.length;
                for(let i=0;i<oneBlockLen;i++){
                    byteArr[byteArrLen+i]=oneBlock[i];
                }
            }else{
                break;
            }
        }
        if(byteArr.length>0){
            return Buffer.fromArray(byteArr).toString();
        }

        return "";
    }
    /**
     * 从一个block中读出数据，如果返回值为空数组，则表示没读到，不需要继续读取了
     * 这里不一定返回16个字节，如果提前读到两个0x00，则只返回有用的数据
     */
    function readOneBlock(blockNum: number): number[] {
        serial.setRxBufferSize(50)
        let myBuffer: number[] = [];
        myBuffer[0] = 0x01;
        myBuffer[1] = 0x08;
        myBuffer[2] = 0xA3;
        myBuffer[3] = 0x20;
        myBuffer[4] = blockNum;
        myBuffer[5] = 0x01;
        myBuffer[6] = 0x00;
        myBuffer[7] = 0x00;
        fillInCheckSum(myBuffer);
        let cmdReadData = pins.createBufferFromArray(myBuffer)
        serial.writeBuffer(cmdReadData);
        basic.pause(50);
        let retData: number[] = []
        receivedLen = RxBufferedSize();
        if (receivedLen == 22) {
            receivedBuffer = serial.readBuffer(22);
            for(let i=0;i<16;i++){
                //出现连续两个0x00，则表示已经到了结尾了
                if (receivedBuffer[i+5] == 0x00 && receivedBuffer[i+6] == 0x00){
                    break;
                }
                retData[i] = receivedBuffer[i + 5];
            }
        }
        return retData;
    }

    /**
     * dataArr是整个数据包，最后一位放checkSum。所以dataArr的第0到第dataArr.lenght-2的数据是要发送的数据，dataArr.length-1是checkSum
     * 计算得到checkSum后，把dataArr[length-1]=checkSum
     */
    function fillInCheckSum(dataArr: number[]): void{
        let checkSum = 0;
        let dataArrLen_1 = dataArr.length-1;
        for (let i = 0; i < dataArrLen_1;i++){
            checkSum ^= dataArr[i];
        }
        checkSum = ~checkSum;

        dataArr[dataArrLen_1] = checkSum;
    }


    basic.forever(() => {
        if (init && (myNFCevent != null) && !pauseDetect) {
            if (detectedRFIDcard()) {
                pauseDetect = true; //暂时关闭NFC卡检测，让myNFCevent()里面定义的所有代码执行完毕
                myNFCevent();
                pauseDetect = false;//myNFCevent()执行完毕，重新开始检测NFC卡
            }
            basic.pause(50);
        }
    })
}
