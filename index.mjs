import axios from "axios";
import { createCanvas, loadImage } from "canvas";
import sharp from "sharp";

const url = process.env.URL;
var token;

var receiptHandle;

export const handler = async (event) => {
  console.log(event);
  const apiUrl = url + "user/login";
  const { data } = await axios.post(apiUrl, {
    email: process.env.EMAIL,
    password: process.env.PASSWORD,
  });
  token = data.token;

  const elevation_id = event.Records[0].body;
  receiptHandle = event.Records[0].receiptHandle;
  if (isNaN(elevation_id)) {
    console.log("Invalid body");
    return {
      statusCode: 500,
      body: JSON.stringify("Invalid body"),
    };
  } else {
    return await runCompositeImagesFunction(elevation_id, token);
  }
};

const runCompositeImagesFunction = async (elevation_id, token) => {
  try {
    const apiUrl = url + `building/elevation-detail-composite/${elevation_id}`;
    const { data } = await axios
      .get(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .catch((e) => {
        throw e;
      });
    const { droneUrl, manualUrl } = await generateCompositeImages(data);

    console.log({
      droneUrl,
      manualUrl,
    });

    const uploadCompositeUrl = url + `building/elevation-composite-result`;
    await axios
      .patch(
        uploadCompositeUrl,
        {
          elevation_id: data.elevation.id,
          droneUrl,
          manualUrl,
          // receiptHandle,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      .then((result) => {
        console.log(result);
      })
      .catch((e) => {
        throw e;
      });

    return {
      statusCode: 200,
      body: JSON.stringify("Message processed successfully"),
    };
  } catch (error) {
    console.log(error);
    console.log(error.response.data);
    return {
      statusCode: 500,
      body: JSON.stringify("Error processing message"),
    };
  }

  //   let elevation = await elevationRepository.findOne(elevation_id);

  //   elevation.composite_drone = droneUrl;
  //   elevation.composite_manual = manualUrl;
  //   elevation.running_composite = false;

  //   await elevationRepository.update(
  //     { id: elevation.id },
  //     { ...elevation }
  //   );
};

const generateCompositeImages = async (elevationDetail) => {
  const {
    elevation,
    elevationImages,
    elevationNormalImages,
    closeRangeImages,
  } = elevationDetail;
  const { droneUrl, manualUrl } = await createFullElevationImage(
    elevation.id,
    elevation.direction,
    await getPositions(
      elevation.images,
      elevation.columns,
      elevation.rows,
      elevation.direction
    ),
    elevationImages,
    elevation.manual_images,
    elevationNormalImages,
    elevation.columns,
    elevation.manual_rows
  );
  return {
    droneUrl,
    manualUrl,
  };
};

const getPositions = async (listImgs, columns, rows, direction) => {
  try {
    let positions = [];
    if (listImgs && columns) {
      const newPos = [];
      let currentIndex = 1;
      if (direction === 0 || direction === 1) {
        const numRow = Math.ceil(listImgs.length / columns);
        for (let i = 0; i < numRow; i++) {
          const newRows = [];
          for (let j = 0; j < columns; j++) {
            const findIndex = listImgs
              .map((i) => i.order)
              .indexOf(currentIndex);
            const newEl = { ...listImgs[findIndex] };
            if (direction === 0) {
              if (i % 2 === 0) {
                newRows.push({ ...newEl, row: i, col: j });
              } else {
                newRows.unshift({
                  ...newEl,
                  row: i,
                  col: columns - 1 - j,
                });
              }
            } else {
              if (i % 2 !== 0) {
                newRows.push({ ...newEl, row: i, col: j });
              } else {
                newRows.unshift({
                  ...newEl,
                  row: i,
                  col: columns - 1 - j,
                });
              }
            }
            currentIndex++;
          }
          newPos.push(newRows);
        }
        positions = [...newPos];
      } else {
        const numColumn = Math.ceil(listImgs.length / rows);
        for (let i = 0; i < numColumn; i++) {
          const newCoulmns = [];
          for (let j = 0; j < rows; j++) {
            const findIndex = listImgs
              .map((i) => i.order)
              .indexOf(currentIndex);
            const newEl = { ...listImgs[findIndex] };
            if (direction === 2) {
              if (i % 2 === 0) {
                newCoulmns.push({ ...newEl, row: j, col: i });
              } else {
                newCoulmns.unshift({
                  ...newEl,
                  row: rows - 1 - j,
                  col: i,
                });
              }
            } else {
              if (i % 2 !== 0) {
                newCoulmns.push({
                  ...newEl,
                  row: rows - 1 - j,
                  col: numColumn - 1 - i,
                });
              } else {
                newCoulmns.unshift({
                  ...newEl,
                  row: j,
                  col: numColumn - 1 - i,
                });
              }
            }
            currentIndex++;
          }
          newPos.push(newCoulmns);
        }
        if (direction === 3) {
          const posReverse = [...newPos].reverse();
          positions = [...posReverse];
        } else {
          positions = [...newPos];
        }
      }
    }
    return positions;
  } catch (error) {
    console.log(error);
  }
};

const rhombus = (ctx, xCenter, yCenter, size, color) => {
  const numberOfSides = 4;
  ctx.beginPath();
  ctx.moveTo(xCenter + size * Math.cos(0), yCenter + size * Math.sin(0));
  for (let k = 1; k <= numberOfSides; k += 1) {
    ctx.lineTo(
      xCenter + size * Math.cos((k * 2 * Math.PI) / numberOfSides),
      yCenter + size * Math.sin((k * 2 * Math.PI) / numberOfSides)
    );
  }
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fill();
};

const pentagon = (ctx, xCenter, yCenter, size, color) => {
  const numberOfSides = 5;
  const step = (2 * Math.PI) / numberOfSides, //Precalculate step value
    shift = (Math.PI / 180.0) * -18;
  ctx.beginPath();
  ctx.moveTo(xCenter + size * Math.cos(0), yCenter + size * Math.sin(0));
  for (let i = 0; i <= numberOfSides; i++) {
    let curStep = i * step + shift;
    ctx.lineTo(
      xCenter + size * Math.cos(curStep),
      yCenter + size * Math.sin(curStep)
    );
  }
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fill();
};

const shapeOfLegends = {
  crackUnSafe: "square-#FF0000", //red
  spallingUnSafe: "pentagon-#FF0000", //red
  corrosionUnSafe: "circle-#FF0000", //red
  otherUnSafe: "rhombus-#FF0000", //red
  crackTotalRequireRepair: "square-#FFFF00", //yellow
  crackReportedRequireRepair: "",
  spallingTotalRequireRepair: "pentagon-#FFFF00", //yellow
  spallingReportedRequireRepair: "",
  corrosionTotalRequireRepair: "circle-#FFFF00", //yellow
  corrosionReportedRequireRepair: "",
  otherTotalRequireRepair: "rhombus-#FFFF00", //yellow
  otherReportedRequireRepair: "",
  crackTotalSafe: "square-#00FF00", //green
  crackReportedSafe: "",
  spallingTotalSafe: "pentagon-#00FF00", //green
  spallingReportedSafe: "",
  corrosionTotalSafe: "circle-#00FF00", //green
  corrosionReportedSafe: "",
  otherTotalSafe: "rhombus-#00FF00", //green
  otherReportedSafe: "",
  crackTotalFP: "square-#00FFFF", //blue
  spallingTotalFP: "pentagon-#00FFFF", //blue
  corrosionTotalFP: "circle-#00FFFF", //blue
  otherTotalFP: "rhombus-#00FFFF", //blue
};

const drawShape = (
  ctx,
  x,
  y,
  sh,
  color,
  shape,
  countBoxOfRow,
  nextLine,
  totalCount,
  report
) => {
  ctx.lineWidth = 1;
  ctx.fillStyle = color;
  // create box color
  if (shape === "square") {
    // hinh vuong
    ctx.fillRect(
      x + 8 + countBoxOfRow * 40,
      y + sh - 42 - nextLine * 38,
      32,
      32
    );
  } else if (shape === "pentagon") {
    // hinh ngu giac
    const xCenter = x + 24 + countBoxOfRow * 40,
      yCenter = y + sh - 26 - nextLine * 38,
      size = 18;
    pentagon(ctx, xCenter, yCenter, size, color);
  } else if (shape === "circle") {
    // hinh tron
    const xCenter = x + 24 + countBoxOfRow * 40,
      yCenter = y + sh - 26 - nextLine * 38,
      size = 18;
    ctx.beginPath();
    ctx.arc(xCenter, yCenter, size, 0, 2 * Math.PI, false);
    ctx.fill();
  } else {
    // hinh thoi
    const xCenter = x + 24 + countBoxOfRow * 40,
      yCenter = y + sh - 26 - nextLine * 38,
      size = 18;
    rhombus(ctx, xCenter, yCenter, size, color);
  }
  // fill number defect
  ctx.fillStyle = "#000";
  ctx.font = "14px Georgia";
  report
    ? ctx.fillText(
        report + "/" + totalCount,
        x + 15 + countBoxOfRow * 40,
        y + sh - 24 - nextLine * 38
      )
    : ctx.fillText(
        totalCount,
        x + 20 + countBoxOfRow * 40,
        y + sh - 24 - nextLine * 38
      );
};

const depict = async (options, ctx) => {
  try {
    const myOptions = Object.assign({}, options);
    if (myOptions.direction) {
      if (myOptions.row === 1) {
        ctx.fillStyle = "#000";
        ctx.font = "20px Georgia";
        ctx.fillText(myOptions.column, myOptions.x - 30, myOptions.y + 200);
      }
      if (myOptions.column === 1) {
        ctx.fillStyle = "#000";
        ctx.font = "20px Georgia";
        ctx.fillText(myOptions.row, myOptions.x + 150, myOptions.y - 20);
      }
    } else {
      if (myOptions.row === 1) {
        ctx.fillStyle = "#000";
        ctx.font = "20px Georgia";
        ctx.fillText(myOptions.column, myOptions.x + 200, myOptions.y - 20);
      }
      if (myOptions.column === 1) {
        ctx.fillStyle = "#000";
        ctx.font = "20px Georgia";
        ctx.fillText(myOptions.row, myOptions.x - 30, myOptions.y + 150);
      }
    }
    if (myOptions.uri) {
      const img = await loadImage(myOptions.uri);

      ctx.drawImage(img, myOptions.x, myOptions.y, myOptions.sw, myOptions.sh);
      if (myOptions.closeRangeStatus === true) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#FF5F00";
        ctx.strokeRect(
          myOptions.x + 2,
          myOptions.y + 2,
          myOptions.sw - 4,
          myOptions.sh - 4
        );
      }
      const defects = myOptions.defects;
      let totalAnno =
        Object.values(defects).reduce((sum, def) => sum + def, 0) || 0;
      if (totalAnno > 0) {
        let countBoxOfRow = 0,
          nextLine = 0;
        for (const key in shapeOfLegends) {
          const count = defects[key];
          if (key.indexOf("Reported") === -1) {
            if (count > 0) {
              if (countBoxOfRow === 4) {
                nextLine++;
                countBoxOfRow -= 4;
              }
              const keyReport =
                key.indexOf("Total") !== -1
                  ? key.replace("Total", "Reported")
                  : "";
              const indexSlice = shapeOfLegends[key].indexOf("-");
              const shape = shapeOfLegends[key].slice(0, indexSlice);
              const color = shapeOfLegends[key].slice(
                indexSlice + 1,
                shapeOfLegends[key].length
              );
              drawShape(
                ctx,
                myOptions.x,
                myOptions.y,
                myOptions.sh,
                color,
                shape,
                countBoxOfRow,
                nextLine,
                count,
                defects[keyReport] || null
              );
              countBoxOfRow++;
            }
          }
        }
      }
      const closeRangeDefect = myOptions.closeRangeDefect;
      totalAnno = Object.values(closeRangeDefect).reduce(
        (sum, def) => sum + def,
        0
      );
      if (totalAnno > 0) {
        let countBoxOfRow = 0,
          nextLine = 0;
        for (const key in shapeOfLegends) {
          const count = closeRangeDefect[key];
          if (key.indexOf("Reported") === -1) {
            if (count > 0) {
              if (countBoxOfRow === 4) {
                nextLine++;
                countBoxOfRow -= 4;
              }
              const keyReport =
                key.indexOf("Total") !== -1
                  ? key.replace("Total", "Reported")
                  : "";
              const indexSlice = shapeOfLegends[key].indexOf("-");
              const shape = shapeOfLegends[key].slice(0, indexSlice);
              const color = shapeOfLegends[key].slice(
                indexSlice + 1,
                shapeOfLegends[key].length
              );
              drawShape(
                ctx,
                myOptions.x,
                myOptions.y,
                52,
                color,
                shape,
                countBoxOfRow,
                nextLine,
                count,
                closeRangeDefect[keyReport] || null
              );
              countBoxOfRow++;
            }
          }
        }
      }
    }
  } catch (error) {
    console.log(error);
  }
};

export const createFullElevationImage = async (
  id,
  direction,
  position,
  listCountColorAnnotates,
  listManualImages,
  manualImagesReview,
  columns,
  manualRow
) => {
  try {
    let canvas1 = null;
    let canvas2 = null;
    const imgs = [];
    let countColors = {};
    let countCloseRangeColor = {};
    const width = 400;
    const height = 300;
    if (direction === 0 || direction === 1) {
      canvas1 = createCanvas(
        position[0].length * width + 40,
        position.length * height + 40
      );
      position.forEach((col, idc) => {
        col.forEach((row, idr) => {
          let findIndex = listCountColorAnnotates
            .map((i) => i.url)
            .indexOf(row.url);
          if (findIndex !== -1) {
            countColors = listCountColorAnnotates[findIndex].defects || {};
            countCloseRangeColor =
              listCountColorAnnotates[findIndex].closeRangeDefects || {};
          } else {
            countColors = {};
            countCloseRangeColor = {};
          }
          imgs.push({
            uri: row?.url ? row.url : row?.urlOriginal ? row.urlOriginal : "",
            closeRangeStatus: row?.closeRangeStatus || false,
            x: width * idr + 40,
            y: height * idc + 40,
            sw: width,
            sh: height,
            defects: countColors,
            closeRangeDefect: countCloseRangeColor,
            column: idr + 1,
            row: idc + 1,
            direction: false,
          });
        });
      });
    } else {
      canvas1 = createCanvas(
        position.length * width + 40,
        position[0].length * height + 40
      );
      position.forEach((row, idr) => {
        (direction === 2 ? row : [...row].reverse()).forEach((col, idc) => {
          let findIndex = listCountColorAnnotates
            .map((i) => i.url)
            .indexOf(col.url);
          if (findIndex !== -1) {
            countColors = listCountColorAnnotates[findIndex].defects || {};
            countCloseRangeColor =
              listCountColorAnnotates[findIndex].closeRangeDefects || {};
          } else {
            countColors = {};
            countCloseRangeColor = {};
          }
          imgs.push({
            uri: col?.url ? col.url : col?.urlOriginal ? col.urlOriginal : "",
            closeRangeStatus: col?.closeRangeStatus || false,
            x: width * idr + 40,
            y: height * idc + 40,
            sw: width,
            sh: height,
            defects: countColors,
            closeRangeDefect: countCloseRangeColor,
            column: idc + 1,
            row: idr + 1,
            direction: true,
          });
        });
      });
    }

    const ctx = canvas1.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas1.width, canvas1.height);
    for (const item of imgs) {
      await depict(item, ctx);
    }
    const manualImgs = [];
    canvas2 = createCanvas(columns * width + 40, manualRow * height + 40);
    listManualImages.forEach((item) => {
      const review = manualImagesReview.find((r) => r.url === item.url);

      manualImgs.push({
        uri: item?.url ? item.url : item?.urlOriginal ? item.urlOriginal : "",
        closeRangeStatus: item?.closeRangeStatus || false,
        x: width * (item.column - 1) + 40,
        y: height * (item.row - 1) + 40,
        sw: width,
        sh: height,
        defects: review?.defects || {},
        closeRangeDefect: review?.closeRangeDefects || {},
        column: item.column,
        row: item.row,
        direction: false,
      });
    });

    const ctx2 = canvas2.getContext("2d");
    ctx2.fillStyle = "white";
    ctx2.fillRect(0, 0, canvas2.width, canvas2.height);
    for (const item of manualImgs) {
      await depict(item, ctx2);
    }
    // Get the image as a data url
    let dataUrl = null;
    let manualDataUrl = null;
    let droneUrl = null;
    let manualUrl = null;
    if (canvas1) {
      dataUrl = canvas1.toBuffer("image/jpeg");
    }
    if (canvas2) {
      manualDataUrl = canvas2.toBuffer("image/jpeg");
    }

    // Release
    if (typeof dataUrl === "string") {
      dataUrl = Buffer.from(dataUrl.toString(), "utf-8");
    }
    if (typeof manualDataUrl === "string") {
      manualDataUrl = Buffer.from(manualDataUrl.toString(), "utf-8");
    }

    if (dataUrl) {
      dataUrl = await sharp(dataUrl).jpeg({ quality: 30 }).toBuffer();
      const data = {
        filename: `${id}-drone`,
        contentType: "image/jpeg",
        key: "composite",
      };
      let result = await axios.post(
        url + `upload/upload-signed-url-image`,
        data,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      await fetch(result.data.signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "image/jpeg",
        },
        body: dataUrl,
      }).catch((e) => {
        console.log(e);
      });
      droneUrl = result.data.signedUrl.split("?")[0];
    }
    if (manualDataUrl) {
      manualDataUrl = await sharp(manualDataUrl)
        .jpeg({ quality: 30 })
        .toBuffer();
      const data = {
        filename: `${id}-manual`,
        contentType: "image/jpeg",
        key: "composite",
      };
      let result = await axios.post(
        url + `upload/upload-signed-url-image`,
        data,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      await fetch(result.data.signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "image/jpeg",
        },
        body: manualDataUrl,
      }).catch((e) => {
        console.log(e);
      });
      manualUrl = result.data.signedUrl.split("?")[0];
    }
    return { droneUrl, manualUrl };
  } catch (error) {
    console.log(error);
  }
};
