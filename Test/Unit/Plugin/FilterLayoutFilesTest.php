<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Test\Unit\Plugin;

use Magento\Framework\View\Design\ThemeInterface;
use Magento\Framework\View\Layout\File\Collector\Aggregated;
use OOCS\LynxTheme\Helper\Theme as ThemeHelper;
use OOCS\LynxTheme\Plugin\FilterLayoutFiles;
use PHPUnit\Framework\TestCase;

/**
 * Lynx store views read only lynx_*.xml layout files
 */
class FilterLayoutFilesTest extends TestCase
{
    /**
     * The plugin with the theme helper answering as given
     *
     * @param bool $lynx
     * @return FilterLayoutFiles
     */
    private function plugin(bool $lynx): FilterLayoutFiles
    {
        $helper = $this->createMock(ThemeHelper::class);
        $helper->method('isLynxTheme')->willReturn($lynx);

        return new FilterLayoutFiles($helper);
    }

    /**
     * The layout file search narrows to lynx_*.xml on a Lynx theme
     *
     * @return void
     */
    public function testNarrowsOnLynx(): void
    {
        $theme = $this->createMock(ThemeInterface::class);

        $this->assertSame(
            [$theme, 'lynx_*.xml'],
            $this->plugin(true)->beforeGetFiles($this->createMock(Aggregated::class), $theme, '*.xml')
        );
    }

    /**
     * Other themes and other patterns are left alone
     *
     * @return void
     */
    public function testUntouched(): void
    {
        $theme = $this->createMock(ThemeInterface::class);
        $collector = $this->createMock(Aggregated::class);

        $this->assertNull($this->plugin(false)->beforeGetFiles($collector, $theme, '*.xml'));
        $this->assertNull($this->plugin(true)->beforeGetFiles($collector, $theme, 'default.xml'));
    }
}
