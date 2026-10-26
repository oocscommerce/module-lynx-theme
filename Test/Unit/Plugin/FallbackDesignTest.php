<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Test\Unit\Plugin;

use Magento\Framework\App\Request\Http as Request;
use Magento\Framework\View\DesignInterface;
use OOCS\LynxTheme\Model\ThemeFallback;
use OOCS\LynxTheme\Plugin\FallbackDesign;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * Pages handed back to Magento render with the fallback theme; every other question keeps its answer
 */
class FallbackDesignTest extends TestCase
{
    /**
     * @var ThemeFallback&MockObject
     */
    private ThemeFallback $fallback;

    /**
     * @var FallbackDesign
     */
    private FallbackDesign $plugin;

    /**
     * Fallback on, theme 3, for the multishipping pages; the request is one of them
     *
     * @return void
     */
    protected function setUp(): void
    {
        $request = $this->createMock(Request::class);
        $request->method('getFullActionName')->willReturn('multishipping_checkout_addresses');
        $this->fallback = $this->createMock(ThemeFallback::class);
        $this->fallback->method('getThemeId')->willReturn('3');
        $this->fallback->method('matches')->willReturnCallback(fn ($action) => str_starts_with($action, 'multi'));

        $this->plugin = new FallbackDesign($request, $this->fallback);
    }

    /**
     * Ask for the theme
     *
     * @param mixed $area
     * @param array $params
     * @return mixed
     */
    private function theme(mixed $area = null, array $params = []): mixed
    {
        return $this->plugin->afterGetConfigurationDesignTheme(
            $this->createMock(DesignInterface::class),
            '7',
            $area,
            $params
        );
    }

    /**
     * A matching frontend page gets the fallback theme
     *
     * @return void
     */
    public function testMatchingPage(): void
    {
        $this->fallback->method('isActive')->willReturn(true);

        $this->assertSame('3', $this->theme());
        $this->assertSame('3', $this->theme('frontend'));
    }

    /**
     * Fallback off, another area or a question about a given store keeps the configured theme
     *
     * @return void
     */
    public function testKeepsTheme(): void
    {
        $this->fallback->method('isActive')->willReturnOnConsecutiveCalls(false, true);

        $this->assertSame('7', $this->theme());
        $this->assertSame('7', $this->theme('adminhtml'));
        $this->assertSame('7', $this->theme(null, ['store' => 2]));
    }
}
