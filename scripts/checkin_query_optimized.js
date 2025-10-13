/* 使用方法：
 * 1、把该脚本放到见证节点数据目录中，通常是~/data/
 * 2、在家目录即~下，运行指令（举例，参数请根据具体需要进行调整）：
 * ~/jouleverse-node-20240229/geth --exec 'let YEAR = 2025, MONTH = 6; loadScript("/data/checkin_query_optimized.js");"done"' attach ~/data/mainnet/geth.ipc
 */
// 配置信息 - 根据实际部署修改这些地址
const JVCORE_ADDRESS = "0x8d214415b9c5F5E4Cf4CbCfb4a5DEd47fb516392"; // JVCore合约地址
const POPBADGE_ADDRESS = "0xCb1429da13cE40e75519148e796C6D58dD6b1a8E"; // POPBadge合约地址

// JVCore合约ABI（简化版，只包含需要的方法）
const JVCORE_ABI = [{
    "constant": true,
    "inputs": [{"name": "tokenId", "type": "uint256"}],
    "name": "ownerOf",
    "outputs": [{"name": "", "type": "address"}],
    "type": "function"
}];

// POPBadge合约ABI（简化版）
const POPBADGE_ABI = [
    {
        "constant": true,
        "inputs": [{"name": "tokenId", "type": "uint256"}],
        "name": "getPOPInfo",
        "outputs": [
            {"name": "jvCoreTokenId", "type": "uint256"},
            {"name": "checkInBlockNumber", "type": "uint256"},
            {"name": "checkInTimestamp", "type": "uint256"}
        ],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "totalSupply",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [{"name": "index", "type": "uint256"}],
        "name": "tokenByIndex",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
    }
];

// 初始化合约实例
var jvCore = eth.contract(JVCORE_ABI).at(JVCORE_ADDRESS);
var popBadge = eth.contract(POPBADGE_ABI).at(POPBADGE_ADDRESS);

/**
 * 获取指定月份的所有签到记录（优化版）
 * @param {number} year - 年份（如：2024）
 * @param {number} month - 月份（1-12）
 * @returns {Array} 包含地址和core id的数组
 */
function getCheckInRecordsByMonth(year, month) {
    console.log("开始获取 " + year + "年" + month + "月 的签到记录...");
    
    // 计算时间范围（Unix时间戳）
    const startTime = Math.floor(new Date(year, month - 1, 1).getTime() / 1000);
    const endTime = Math.floor(new Date(year, month, 1).getTime() / 1000) - 1;
    
    console.log("时间范围: " + new Date(startTime * 1000) + " 到 " + new Date(endTime * 1000));
    
    const results = getRecordsWithBinarySearch(startTime, endTime);
    console.log("查询完成！共找到 " + results.length + " 条签到记录");
    return formatResults(results);
}

/**
 * 使用二分查找优化查询POPBadge记录
 */
function getRecordsWithBinarySearch(startTime, endTime) {
    const totalSupply = popBadge.totalSupply.call().toNumber();
    console.log("POPBadge总供应量: " + totalSupply);
    
    if (totalSupply === 0) {
        return [];
    }
    
    // 使用二分查找找到第一个时间戳 >= startTime 的POPBadge
    let startIndex = binarySearchLowerBound(startTime, totalSupply);
    console.log("二分查找结果: 起始索引 = " + startIndex);
    
    if (startIndex === -1) {
        return []; // 没有找到符合条件的记录
    }
    
    // 从起始索引开始向前后搜索
    return expandSearch(startIndex, startTime, endTime, totalSupply);
}

/**
 * 二分查找下界：找到第一个时间戳 >= targetTime 的POPBadge索引
 */
function binarySearchLowerBound(targetTime, totalSupply) {
    let left = 0;
    let right = totalSupply - 1;
    let result = -1;
    
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const midTime = getPopBadgeTimestamp(mid);
        
        if (midTime === null) {
            // 如果中间记录无效，向右移动
            left = mid + 1;
            continue;
        }
        
        if (midTime >= targetTime) {
            result = mid;
            right = mid - 1; // 继续向左搜索更早的符合条件的记录
        } else {
            left = mid + 1;
        }
    }
    
    return result;
}

/**
 * 从起始索引向前后扩展搜索
 */
function expandSearch(startIndex, startTime, endTime, totalSupply) {
    const results = [];
    
    // 向前搜索（向索引小的方向）
    let leftIndex = startIndex;
    while (leftIndex >= 0) {
        const record = getValidPopBadgeRecord(leftIndex, startTime, endTime);
        if (record) {
            results.unshift(record); // 按时间顺序插入到前面
            leftIndex--;
        } else {
            break; // 遇到不在时间范围内的记录，停止向前搜索
        }
    }
    
    // 向后搜索（向索引大的方向）
    let rightIndex = startIndex + 1;
    while (rightIndex < totalSupply) {
        const record = getValidPopBadgeRecord(rightIndex, startTime, endTime);
        if (record) {
            results.push(record);
            rightIndex++;
        } else {
            break; // 遇到不在时间范围内的记录，停止向后搜索
        }
    }
    
    return results;
}

/**
 * 获取指定索引的POPBadge时间戳
 */
function getPopBadgeTimestamp(index) {
    try {
        const popTokenId = popBadge.tokenByIndex.call(index);
        const popInfo = popBadge.getPOPInfo.call(popTokenId);
        return popInfo[2].toNumber(); // checkInTimestamp
    } catch (error) {
        return null; // 记录无效
    }
}

/**
 * 获取有效的POPBadge记录（如果在时间范围内）
 */
function getValidPopBadgeRecord(index, startTime, endTime) {
    try {
        const popTokenId = popBadge.tokenByIndex.call(index);
        const popInfo = popBadge.getPOPInfo.call(popTokenId);
        
        const checkInTime = popInfo[2].toNumber();
        
        // 检查是否在指定时间范围内
        if (checkInTime >= startTime && checkInTime < endTime) {
            const coreId = popInfo[0].toNumber();
            const owner = jvCore.ownerOf.call(coreId);
            
            return {
                address: owner,
                coreId: coreId,
                checkInTime: checkInTime,
                popTokenId: popTokenId.toNumber(),
                blockNumber: popInfo[1].toNumber()
            };
        }
        
        // 如果时间戳小于开始时间，说明已经搜索到太早的记录
        if (checkInTime < startTime) {
            return null;
        }
        
        // 如果时间戳大于等于结束时间，说明已经搜索到太晚的记录
        if (checkInTime >= endTime) {
            return null;
        }
        
    } catch (error) {
        // 跳过错误记录
    }
    
    return null;
}

/**
 * 格式化时间戳为 yyyy/mm/dd HH:MM:SS 格式
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return year + '/' + month + '/' + day + ' ' + hours + ':' + minutes + ':' + seconds;
}

/**
 * 按照core id分组并合并签到时间
 */
function groupResultsByCoreId(results) {
    const grouped = {};
    
    // 按core id分组
    results.forEach(record => {
        if (!grouped[record.coreId]) {
            grouped[record.coreId] = {
                address: record.address,
                coreId: record.coreId,
                checkInTimes: []
            };
        }
        grouped[record.coreId].checkInTimes.push(record.checkInTime);
    });
    
    // 转换为数组并按core id排序
    const groupedArray = Object.values(grouped);
    groupedArray.sort((a, b) => a.coreId - b.coreId);
    
    // 对每个core id的签到时间排序
    groupedArray.forEach(group => {
        group.checkInTimes.sort((a, b) => a - b);
    });
    
    return groupedArray;
}

/**
 * 格式化输出结果（按core id分组）
 */
function formatResults(results) {
    // 按照core id分组
    const groupedResults = groupResultsByCoreId(results);
    
    console.log("\n=== 签到记录汇总 ===");
    console.log("Core ID\t地址\t\t\t\t\t\t签到时间");
    console.log("========================================================================================");
    
    for (let i = 0; i < groupedResults.length; i++) {
        const group = groupedResults[i];
        
        // 格式化所有签到时间
        const formattedTimes = group.checkInTimes.map(time => formatTimestamp(time));
        const checkInTimesStr = formattedTimes.join('; ');
        
        console.log(group.coreId + "\t" + group.address + "\t" + checkInTimesStr);
    }
    
    // 输出简化的统计信息
    console.log("\n=== 统计信息 ===");
    console.log("总签到记录数: " + results.length);
    console.log("涉及Core ID数量: " + groupedResults.length);
    
    if (groupedResults.length > 0) {
        // 显示core id范围
        const coreIds = groupedResults.map(g => g.coreId);
        const minCoreId = Math.min(...coreIds);
        const maxCoreId = Math.max(...coreIds);
        console.log("Core ID范围: " + minCoreId + " - " + maxCoreId);
        
        // 显示时间范围
        const allTimes = results.map(r => r.checkInTime);
        const minTime = Math.min(...allTimes);
        const maxTime = Math.max(...allTimes);
        console.log("时间范围: " + formatTimestamp(minTime) + " - " + formatTimestamp(maxTime));
    }
    
    return groupedResults;
}

/**
 * 性能测试函数
 */
function benchmarkSearch(year, month) {
    console.log("=== 性能测试 ===");
    const startTime = Date.now();
    
    const results = getCheckInRecordsByMonth(year, month);
    
    const endTime = Date.now();
    console.log("查询耗时: " + (endTime - startTime) + "ms");
    
    return results;
}

// 使用示例
function main() {
    // 从命令行参数获取年月，如果没有则使用默认值
    const year = YEAR || 2025;
    const month = MONTH || new Date().getMonth() + 1;
    
    console.log("JVCore签到记录查询工具（优化版）");
    console.log("==============================");
    
    return getCheckInRecordsByMonth(year, month);
}

// 执行主函数
main();
