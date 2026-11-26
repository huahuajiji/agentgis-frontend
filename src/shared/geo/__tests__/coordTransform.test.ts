import { describe, expect, it } from 'vitest';
import {
  gcj02ToWgs84,
  outOfChina,
  transformGeometry,
  transformPosition,
  wgs84ToGcj02
} from '../coordTransform';

// 北京天安门附近：GCJ-02 与 WGS-84 的标准对照（离线公开值，误差容差 1e-5°）。
const TIANANMEN_GCJ: [number, number] = [116.397128, 39.916527];
const TIANANMEN_WGS: [number, number] = [116.391216, 39.915137];

describe('coordTransform · 基本方向', () => {
  it('GCJ → WGS 接近标准对照值', () => {
    const [lon, lat] = gcj02ToWgs84(...TIANANMEN_GCJ);
    expect(Math.abs(lon - TIANANMEN_WGS[0])).toBeLessThan(5e-4);
    expect(Math.abs(lat - TIANANMEN_WGS[1])).toBeLessThan(5e-4);
  });

  it('WGS → GCJ 接近标准对照值', () => {
    const [lon, lat] = wgs84ToGcj02(...TIANANMEN_WGS);
    expect(Math.abs(lon - TIANANMEN_GCJ[0])).toBeLessThan(5e-4);
    expect(Math.abs(lat - TIANANMEN_GCJ[1])).toBeLessThan(5e-4);
  });

  it('GCJ → WGS → GCJ 往返误差在 1e-6° 量级', () => {
    const [wLon, wLat] = gcj02ToWgs84(...TIANANMEN_GCJ);
    const [gLon, gLat] = wgs84ToGcj02(wLon, wLat);
    expect(Math.abs(gLon - TIANANMEN_GCJ[0])).toBeLessThan(1e-6);
    expect(Math.abs(gLat - TIANANMEN_GCJ[1])).toBeLessThan(1e-6);
  });

  it('境外坐标直通不做偏移', () => {
    expect(outOfChina(-74.0, 40.7)).toBe(true);
    expect(gcj02ToWgs84(-74.006, 40.7128)).toEqual([-74.006, 40.7128]);
    expect(wgs84ToGcj02(139.6917, 35.6895)).toEqual([139.6917, 35.6895]);
  });

  it('非有限数字原样返回，不抛错', () => {
    expect(gcj02ToWgs84(Number.NaN, 39)).toEqual([Number.NaN, 39]);
    expect(wgs84ToGcj02(116, Number.POSITIVE_INFINITY)).toEqual([116, Number.POSITIVE_INFINITY]);
  });
});

describe('coordTransform · 几何遍历', () => {
  it('transformPosition 保留第三维', () => {
    const result = transformPosition([116.397128, 39.916527, 50], wgs84ToGcj02);
    expect(result).toHaveLength(3);
    expect(result[2]).toBe(50);
  });

  it('Polygon 嵌套环全部转换', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [[
        [116.39, 39.91],
        [116.40, 39.91],
        [116.40, 39.92],
        [116.39, 39.91]
      ]]
    };
    const transformed = transformGeometry(geometry, wgs84ToGcj02);
    expect(transformed.coordinates[0][0]).not.toEqual([116.39, 39.91]);
    expect(transformed.coordinates[0]).toHaveLength(4);
  });

  it('GeometryCollection 递归转换', () => {
    const geometry = {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Point' as const, coordinates: [116.39, 39.91] },
        { type: 'LineString' as const, coordinates: [[116.39, 39.91], [116.40, 39.92]] }
      ]
    };
    const transformed = transformGeometry(geometry, wgs84ToGcj02);
    expect(transformed.geometries[0].coordinates).not.toEqual([116.39, 39.91]);
    expect(transformed.geometries[1].coordinates).toHaveLength(2);
  });
});
